var async = require('async');
var byline = require('byline');
var http = require('http');
var path = require('path');
var request = require('request');
var rimraf = require('rimraf');
var should = require('should');
var sinon = require('sinon');
var zlib = require('zlib');

var fixtures = require('./fixtures');
var mocks = require('./mocks');

describe('frontend', function() {
  
  var config = require('../config');
  var builder = require('../builder');
  var frontend = require('../frontend');
  var grader = require('../grader');
  var rolodex = require('../rolodex');
  
  var fix = fixtures();
  var mock = mocks.HTTPS();
  var sandbox = sinon.sandbox.create();
  var root = 'http://localhost:' + config.web.port + '/';
  var server = http.createServer().on('request', mock.listener).on('request', frontend);
  
  before(function(done){
    async.series([
      async.apply(server.listen.bind(server), config.web.port),
      async.apply(fix.files.bind(fix), this.test)
    ], done);
  });
  
  afterEach(function() {
    mock.clear();
    sandbox.restore();
  });
  
  after(function(done) {
    server.close(done);
  });
  
  describe('GET /', function() {
    it('should render index for students', function(done) {
      mock.user('alice');
      request(root, function(err, res, body) {
        body.should.match(/alice/).and.match(/My repositories.*labs\/lab1\/alice.*labs\/lab2\/alice/);
        done(err);
      });
    });
    it('should render index for staff', function(done) {
      mock.user('eve');
      request(root, function(err, res, body) {
        body.should.match(/eve/).and.match(/All projects/);
        done(err);
      });
    });
  });
  
  describe('GET /milestone/:kind/:proj/:users/:name', function() {
    it('should render a grade report', function(done) {
      mock.user('alice');
      request(root + 'milestone/labs/lab3/alice/beta', function(err, res, body) {
        body.should.match(/Auto-graded rev.*abcd789/);
        done(err);
      });
    });
    it('should fail with missing report', function(done) {
      mock.user('bob');
      request(root + 'milestone/labs/lab3/bob/beta', function(err, res, body) {
        res.statusCode.should.equal(404);
        body.should.match(/Not found/);
        done(err);
      });
    }); 
    it('should fail with missing grade', function(done) {
      mock.user('bob');
      request(root + 'milestone/labs/lab2/bob/beta', function(err, res, body) {
        body.should.match(/Auto-graded rev/).and.match(/NO GRADE/);
        done(err);
      });
    });
    it('should fail when not released', function(done) {
      mock.user('alice');
      request(root + 'milestone/labs/lab3/alice/final', function(err, res, body) {
        res.statusCode.should.equal(404);
        body.should.not.match(/Auto-graded rev/);
        done(err);
      });
    });
    it('should reject unauthorized students', function(done) {
      mock.user('bob');
      request(root + 'milestone/labs/lab3/alice/beta', function(err, res, body) {
        body.should.match(/You are not alice/);
        body.should.not.match(/Auto-graded rev/);
        done(err);
      });
    });
    it('should allow staff', function(done) {
      mock.user('eve');
      request(root + 'milestone/labs/lab3/alice/beta', function(err, res, body) {
        body.should.match(/Auto-graded rev.*abcd789/);
        done(err);
      });
    });
    it('should allow staff when not released', function(done) {
      mock.user('eve');
      request(root + 'milestone/labs/lab3/alice/final', function(err, res, body) {
        body.should.match(/not released to student/).and.match(/Auto-graded rev.*abcd789/);
        done(err);
      });
    });
  });
  
  describe('GET /milestone/:kind/:proj/:name', function() {
    it('should render HTML', function(done) {
      mock.user('eve');
      request(root + 'milestone/projects/helloworld/hello', function(err, res, body) {
        body.should.match(/projects\/helloworld\/alice-bob\/123abc7/);
        done(err);
      });
    });
    it('should render CSV', function(done) {
      mock.user('eve');
      request(root + 'milestone/projects/helloworld/hello.csv', function(err, res, body) {
        var unquoted = body.replace(/"/g, '');
        unquoted.should.match(/Username,Revision,Grade,out of,greeting,salutation/);
        unquoted.should.match(/alice,.*123abc7.*15,20,10,5/);
        unquoted.should.match(/bob,[^0-9]*$/m);
        done(err);
      });
    });
    it('should only allow staff', function(done) {
      mock.user('alice');
      request(root + 'milestone/projects/helloworld/hello', function(err, res, body) {
        body.should.match(/alice/).and.match(/You are not staff/);
        body.should.not.match(/grade|grading|15/i);
        done(err);
      });
    });
  });
  
  describe('GET /sweep/:kind/:proj/:datetime', function() {
    it('should render HTML', function(done) {
      mock.user('eve');
      request(root + 'sweep/projects/helloworld/20130929T110000', function(err, res, body) {
        body.should.match(/projects\/helloworld\/alice-bob\/123abc7/);
        done(err);
      });
    });
    it('should render CSV', function(done) {
      mock.user('eve');
      request(root + 'sweep/projects/helloworld/20130929T110000.csv', function(err, res, body) {
        body.should.match(/alice,bob,.*123abc7/);
        done(err);
      });
    });
    it('should only allow staff', function(done) {
      mock.user('alice');
      request(root + 'sweep/projects/helloworld/20130929T110000', function(err, res, body) {
        body.should.match(/alice/).and.match(/You are not staff/);
        body.should.not.match(/revision|123abc7/i);
        done(err);
      });
    });
  });
  
  describe('GET /u/:users', function() {
    it('should render repos for a user', function(done) {
      mock.user('alice');
      request(root + 'u/alice', function(err, res, body) {
        body.should.match(/alice/).and.match(/Repositories.*labs\/lab1\/alice.*labs\/lab2\/alice/);
        done(err);
      });
    });
    it('should include full names', function(done) {
      mock.user('alice');
      sandbox.stub(rolodex, 'lookup').withArgs('alice').yields(null, 'Alissa P. Hacker');
      request(root + 'u/alice', function(err, res, body) {
        body.should.match(/Alissa P. Hacker/);
        done(err);
      });
    });
    it('should skip full names with errors', function(done) {
      mock.user('alice');
      sandbox.stub(rolodex, 'lookup').yields(new Error());
      request(root + 'u/alice', function(err, res, body) {
        body.should.match(/alice/).and.match(/Repositories/).and.not.match(/Alissa/);
        done(err);
      });
    });
    it('should reject unauthorized students', function(done) {
      mock.user('bob');
      request(root + 'u/alice', function(err, res, body) {
        body.should.match(/bob/).and.match(/You are not alice/);
        body.should.not.match(/labs\/lab1/);
        done(err);
      });
    });
    it('should allow staff', function(done) {
      mock.user('eve');
      request(root + 'u/alice', function(err, res, body) {
        body.should.match(/eve/).and.match(/Repositories.*labs\/lab1\/alice.*labs\/lab2\/alice/);
        done(err);
      });
    });
    it('should reject illegal username', function(done) {
      mock.user('eve');
      sandbox.stub(builder, 'findRepos').throws();
      request(root + 'u/alice.bob', function(err, res, body) {
        res.statusCode.should.equal(404);
        done(err);
      });
    });
  });
  
  describe('GET /:kind/:proj', function() {
    it('should render repos for a student', function(done) {
      mock.user('alice');
      request(root + 'labs/lab1', function(err, res, body) {
        body.should.match(/labs\/lab1\/alice/).and.not.match(/lab2/);
        done(err);
      });
    });
    it('should render all repos for staff', function(done) {
      mock.user('eve');
      request(root + 'labs/lab1', function(err, res, body) {
        body.should.match(/labs\/lab1\/alice/).and.match(/labs\/lab1\/bob/).and.not.match(/lab2/);
        done(err);
      });
    });
    it('should include full names', function(done) {
      mock.user('alice');
      sandbox.stub(rolodex, 'lookup').withArgs('alice').yields(null, 'Alissa P. Hacker');
      request(root + 'labs/lab1', function(err, res, body) {
        body.should.match(/Alissa P. Hacker/);
        done(err);
      });
    });
    it('should skip full names with errors', function(done) {
      mock.user('bob');
      var lookup = sandbox.stub(rolodex, 'lookup');
      lookup.withArgs('alice').yields(null, 'Alissa P. Hacker');
      lookup.withArgs('bob').yields(new Error());
      request(root + 'projects/helloworld', function(err, res, body) {
        body.should.match(/alice-bob/).and.match(/Alissa P. Hacker/);
        done(err);
      });
    });
    it('should reject illegal kind', function(done) {
      mock.user('eve');
      sandbox.stub(builder, 'findRepos').throws();
      request(root + 'labs!/lab1', function(err, res, body) {
        res.statusCode.should.equal(404);
        done(err);
      });
    });
    it('should reject illegal project', function(done) {
      mock.user('eve');
      sandbox.stub(builder, 'findRepos').throws();
      request(root + 'labs/lab!', function(err, res, body) {
        res.statusCode.should.equal(404);
        done(err);
      });
    });
  });
  
  describe('GET /:kind/:proj/:users', function() {
    it('should render a repo', function(done) {
      mock.user('bob');
      request(root + 'labs/lab1/bob', function(err, res, body) {
        body.should.match(/Revisions/)
        body.should.match(/labs\/lab1\/bob\/1234abc/).and.match(/labs\/lab1\/bob\/5678abc/);
        done(err);
      });
    });
    it('should succeed with no builds', function(done) {
      mock.user('alice');
      request(root + 'labs/lab2/alice', function(err, res, body) {
        body.should.match(/No revisions/);
        done(err);
      });
    });
    it('without repo should include the current build', function(done) {
      mock.user('bob');
      request(root + 'labs/lab2/bob', function(err, res, body) {
        body.should.match(/Latest build/);
        body.should.match(/Compilation succeeded/).and.match(/Public tests FAILED/);
        body.should.not.match(/Hidden tests/);
        done(err);
      });
    });
    it('should reject unauthorized students', function(done) {
      mock.user('bob');
      request(root + 'labs/lab1/alice', function(err, res, body) {
        body.should.match(/bob/).and.match(/You are not alice/);
        body.should.not.match(/abcd123/);
        done(err);
      });
    });
    it('should allow staff', function(done) {
      mock.user('eve');
      request(root + 'labs/lab1/bob', function(err, res, body) {
        body.should.match(/labs\/lab1\/bob\/1234abc/);
        done(err);
      });
    });
  });
  
  describe('GET /:kind/:proj/:users/:rev', function() {
    it('should render a build', function(done) {
      mock.user('alice');
      request(root + 'labs/lab3/alice/abcd789', function(err, res, body) {
        body.should.match(/Compilation succeeded/);
        body.should.match(/Public tests passed/).and.match(/thisTestWillPass/);
        body.should.not.match(/Hidden tests/).and.not.match(/thisTestWillFail/);
        done(err);
      });
    });
    it('should fail with missing build', function(done) {
      mock.user('alice');
      request(root + 'labs/lab1/alice/abcd789', function(err, res, body) {
        res.statusCode.should.equal(404);
        body.should.match(/Not found/);
        done(err);
      });
    });
    it('should reject unauthorized students', function(done) {
      mock.user('bob');
      request(root + 'labs/lab3/alice/abcd789', function(err, res, body) {
        body.should.match(/bob/).and.match(/You are not alice/);
        body.should.not.match(/abcd789/);
        done(err);
      });
    });
    it('should allow staff', function(done) {
      mock.user('eve');
      request(root + 'labs/lab3/alice/abcd789', function(err, res, body) {
        body.should.match(/Compilation succeeded/);
        body.should.match(/Public tests passed/).and.match(/thisTestWillPass/);
        body.should.not.match(/Hidden tests/).and.not.match(/thisTestWillFail/);
        done(err);
      });
    });
    it('should show hidden results to staff', function(done) {
      mock.user('eve');
      request({
        uri: root + 'labs/lab3/alice/abcd789',
        headers: { Cookie: 'staffmode=true' }
      }, function(err, res, body) {
        body.should.match(/Compilation succeeded/);
        body.should.match(/Public tests passed/).and.match(/thisTestWillPass/);
        body.should.match(/Hidden tests FAILED/).and.match(/thisTestWillFail/);
        done(err);
      });
    });
    it('should reject illegal revision', function(done) {
      mock.user('alice');
      sandbox.stub(builder, 'findBuild').throws();
      request(root + 'labs/lab3/alice/abcd789!', function(err, res, body) {
        res.statusCode.should.equal(404);
        done(err);
      });
    });
  });
  
  describe('GET /:kind/:proj/:users/:rev/payload/...', function() {
    it('should deliver text data', function(done) {
      mock.user('f_tony');
      request(root + 'projects/truck/f_tony/ab34ef7/payload/public/Visible/quotation.txt', function(err, res, body) {
        res.headers['content-type'].should.eql('text/plain');
        body.should.eql("What's a truck?\n");
        done(err);
      });
    });
    it('should deliver binary data', function(done) {
      mock.user('f_tony');
      request({
        url: root + 'projects/truck/f_tony/ab34ef7/payload/public/Visible/ziptation.txt.gz',
        encoding: null
      }, function(err, res, body) {
        res.headers['content-type'].should.eql('text/plain');
        res.headers['content-encoding'].should.eql('gzip');
        zlib.gunzip(body, function(zerr, result) {
          result.toString().should.eql("What's a truck?\n");
          done(err || zerr);
        });
      });
    });
    it('should fail for test with no payload', function(done) {
      mock.user('f_tony');
      request(root + 'projects/truck/f_tony/ab34ef7/payload/public/Visible/silence', function(err, res, body) {
        res.statusCode.should.equal(404);
        body.should.match(/Not found/i);
        done(err);
      });
    });
    it('should fail for missing test case', function(done) {
      mock.user('f_tony');
      request(root + 'projects/truck/f_tony/ab34ef7/payload/public/Visible/missing', function(err, res, body) {
        res.statusCode.should.equal(404);
        body.should.match(/Not found/i);
        done(err);
      });
    });
    it('should fail for missing test suite', function(done) {
      mock.user('f_tony');
      request(root + 'projects/truck/f_tony/ab34ef7/payload/public/Public/quotation.txt', function(err, res, body) {
        res.statusCode.should.equal(404);
        body.should.match(/Not found/i);
        done(err);
      });
    });
    it('should reject unauthorized students', function(done) {
      mock.user('alice');
      request(root + 'projects/truck/f_tony/ab34ef7/payload/public/Visible/quotation.txt', function(err, res, body) {
        body.should.match(/You are not f_tony/);
        body.should.not.match(/truck/);
        done(err);
      });
    });
    it('should reject hidden payloads', function(done) {
      mock.user('f_tony');
      request(root + 'projects/truck/f_tony/ab34ef7/payload/hidden/Secret/quotation.txt', function(err, res, body) {
        res.statusCode.should.equal(404);
        body.should.match(/Not found/i);
        body.should.not.match(/dumb/);
        done(err);
      });
    });
    it('should allow staff', function(done) {
      mock.user('eve');
      request(root + 'projects/truck/f_tony/ab34ef7/payload/public/Visible/quotation.txt', function(err, res, body) {
        body.should.eql("What's a truck?\n");
        done(err);
      });
    });
    it('should allow staff on hidden payload', function(done) {
      mock.user('eve');
      request(root + 'projects/truck/f_tony/ab34ef7/payload/hidden/Secret/quotation.txt', function(err, res, body) {
        body.should.eql("Don't play dumb with me!\n");
        done(err);
      });
    });
    it('should reject illegal category', function(done) {
      mock.user('f_tony');
      sandbox.stub(builder, 'findBuild').throws();
      request(root + 'projects/truck/f_tony/ab34ef7/payload/evil/Visible/quotation.txt', function(err, res, body) {
        res.statusCode.should.equal(404);
        done(err);
      });
    });
  });
  
  describe('GET /:kind/:proj/:users/:rev/grade', function() {
    it('should render a grade report', function(done) {
      mock.user('eve');
      request(root + 'labs/lab3/alice/abcd789/grade', function(err, res, body) {
        body.should.match(/not linked to milestone/i);
        body.should.match(/auto-grading result/i).and.match(/5\D*\/\D*15/);
        body.should.match(/thisTestWillPass/).and.match(/thisTestWillFail/);
        done(err);
      });
    });
    it('should fail with missing build', function(done) {
      mock.user('eve');
      request(root + 'labs/lab1/alice/abcd789/grade', function(err, res, body) {
        res.statusCode.should.equal(404);
        body.should.match(/Not found/);
        done(err);
      });
    });
    it('should fail with missing grade', function(done) {
      mock.user('eve');
      request(root + 'labs/lab2/bob/1234def/grade', function(err, res, body) {
        body.should.match(/auto-grading result/i).and.match(/NO GRADE/);
        done(err);
      });
    });
    it('should only allow staff', function(done) {
      mock.user('alice');
      sandbox.stub(builder, 'findBuild').throws();
      request(root + 'labs/lab3/alice/abcd789/grade', function(err, res, body) {
        body.should.match(/alice/).and.match(/You are not staff/);
        body.should.not.match(/grade|grading/i);
        done(err);
      });
    });
  });
  
  describe('POST /build/:kind/:proj/:users/:rev', function() {
    it('should start a build and report results', function(done) {
      sandbox.stub(builder, 'findBuild').yields();
      sandbox.stub(builder, 'startBuild').yields(null, 'fake');
      sandbox.stub(builder, 'monitor', function() {
        var emitter = new events.EventEmitter();
        process.nextTick(emitter.emit.bind(emitter, 'start'));
        process.nextTick(emitter.emit.bind(emitter, 'progress', {
          message: 'Forward, not backward!'
        }));
        process.nextTick(emitter.emit.bind(emitter, 'done', {
          result: { compile: true, public: false, hidden: true }
        }));
        return emitter;
      });
      var expected = [
        /started/i,
        /Forward/,
        /compilation succeeded/i,
        /public tests failed/i,
        /details.*labs\/lab2\/alice/i
      ];
      var req = request.post(root + 'build/labs/lab2/alice/abcd123');
      byline(req, { encoding: 'utf8' }).on('data', function(line) {
        line.should.match(expected.shift());
        if (expected.length == 0) { done(); }
      });
    });
    it('should skip an existing build', function(done) {
      sandbox.stub(builder, 'findBuild').yields(null, 'fake');
      sandbox.stub(builder, 'startBuild').throws();
      request.post(root + 'build/labs/lab2/alice/abcd123', function(err, res, body) {
        body.should.match(/revision already built.*labs\/lab2\/alice/i);
        done(err);
      });
    });
  });
  
  describe('POST /grade/:kind/:proj/:name/revs', function() {
    
    var spec = { kind: 'labs', proj: 'lab3', users: [ 'alice' ] };
    var rev = 'abcd789';
    var resultdir = path.join(
      config.build.results, 'milestones', config.student.semester, 'labs', 'lab3', 'alpha'
    );
    
    beforeEach(function(done){
      fix.files(this.test, done);
    });
    
    afterEach(function(done) {
      rimraf(resultdir, done);
    });
    
    it('should assign grades', function(done) {
      mock.user('eve');
      request.post(root + 'grade/labs/lab3/alpha/revs', { form: {
        revision: { alice: rev, bob: '1234abc' }
      } }, function(err, res, body) {
        body.should.match(/error.*bob/i).and.not.match(/lab3\/bob/);
        body.should.match(/assigned.*alice/i).and.match(/lab3\/alice\/abcd789/);
        grader.findMilestoneGrade(spec, 'alpha', function(finderr, graded) {
          graded.rev.should.eql(rev);
          graded.grade.should.include({ score: 5, outof: 15 });
          done(err || finderr);
        });
      });
    });
    it('should only allow staff', function(done) {
      mock.user('alice');
      sandbox.stub(builder, 'findRepos').throws();
      sandbox.stub(grader, 'gradeFromBuilds').throws();
      request.post(root + 'grade/labs/lab3/alpha/revs', { form: {
        revision: { alice: rev }
      } }, function(err, res, body) {
        body.should.match(/alice/).and.match(/You are not staff/);
        grader.findMilestoneGrade(spec, 'alpha', function(finderr, graded) {
          should.exist(finderr);
          done(err);
        });
      });
    });
  });
  
  describe('POST /grade/:kind/:proj/:name/sweep', function() {
    
    var spec = { kind: 'labs', proj: 'lab3', users: [ 'alice' ] };
    var when = '20130101T221500';
    var resultdir = path.join(
      config.build.results, 'milestones', config.student.semester, 'labs', 'lab3', 'alpha'
    );
    
    beforeEach(function(done){
      fix.files(this.test, done);
    });
    
    afterEach(function(done) {
      rimraf(resultdir, done);
    });
    
    it('should assign grades', function(done) {
      mock.user('eve');
      request.post(root + 'grade/labs/lab3/alpha/sweep', { form: {
        datetime: when,
        usernames: 'alice\nbob\n\n'
      } }, function(err, res, body) {
        res.statusCode.should.equal(302);
        grader.findMilestoneGrade(spec, 'alpha', function(finderr, graded) {
          graded.rev.should.eql('abcd789');
          graded.grade.should.include({ score: 90, outof: 100 });
          done(err || finderr);
        });
      });
    });
    it('should only allow staff', function(done) {
      mock.user('alice');
      request.post(root + 'grade/labs/lab3/alpha/sweep', { form: {
        datetime: when,
        usernames: 'alice\n'
      } }, function(err, res, body) {
        body.should.match(/alice/).and.match(/You are not staff/);
        grader.findMilestoneGrade(spec, 'alpha', function(finderr, graded) {
          should.exist(finderr);
          done(err);
        });
      });
    });
  });
  
  describe('POST /milestone/:kind/:proj', function() {
    
    var milestone = 'alpha' + +new Date();
    var resultdir = path.join(
      config.build.results, 'milestones', config.student.semester, 'labs', 'lab3', milestone
    );
    
    afterEach(function(done) {
      rimraf(resultdir, done);
    });
    
    it('should create a new milestone', function(done) {
      mock.user('eve');
      request.post(root + 'milestone/labs/lab3', { form: {
        name: milestone
      } }, function(err, res, body) {
        res.statusCode.should.equal(302);
        grader.findMilestones({}, function(finderr, milestones) {
          milestones.should.includeEql({
            kind: 'labs', proj: 'lab3', name: milestone, released: false
          });
          done(err || finderr);
        });
      });
    });
    it('should only allow staff', function(done) {
      mock.user('alice');
      sandbox.stub(grader, 'createMilestone').throws();
      request.post(root + 'milestone/labs/lab3', { form: {
        name: milestone
      } }, function(err, res, body) {
        body.should.match(/alice/).and.match(/You are not staff/);
        done(err);
      });
    });
  });
  
  describe('POST /milestone/:kind/:proj/:name/release', function() {
    
    var spec = { kind: 'labs', proj: 'lab3' };
    var milestone = 'alpha';
    var resultdir = path.join(
      config.build.results, 'milestones', config.student.semester, 'labs', 'lab3', milestone
    );
    
    beforeEach(function(done){
      fix.files(this.test, done);
    });
    
    afterEach(function(done) {
      rimraf(resultdir, done);
    });
    
    it('should release a milestone', function(done) {
      mock.user('eve');
      request.post(root + 'milestone/labs/lab3/alpha/release', function(err, res, body) {
        res.statusCode.should.equal(302);
        grader.isMilestoneReleasedSync(spec, milestone).should.true;
        done(err);
      });
    });
    it('should only allow staff', function(done) {
      mock.user('alice');
      sandbox.stub(grader, 'releaseMilestone').throws();
      request.post(root + 'milestone/labs/lab3/alpha/release', function(err, res, body) {
        body.should.match(/alice/).and.match(/You are not staff/);
        grader.isMilestoneReleasedSync(spec, milestone).should.false;
        done(err);
      });
    });
  });
});
