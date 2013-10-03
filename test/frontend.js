var async = require('async');
var http = require('http');
var request = require('request');
var sinon = require('sinon');

var fixtures = require('./fixtures');
var mocks = require('./mocks');

describe('frontend', function() {
  
  var config = require('../config');
  var builder = require('../builder');
  var frontend = require('../frontend');
  
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
      })
    });
    it('should render index for staff', function(done) {
      mock.user('eve');
      request(root, function(err, res, body) {
        body.should.match(/eve/).and.match(/All projects/);
        done(err);
      })
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
});
