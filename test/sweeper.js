const async = require('async');
const events = require('events');
const fs = require('fs');
const moment = require('moment');
const path = require('path');
const rimraf = require('rimraf');
const should = require('should');
const sinon = require('sinon');

const fixtures = require('./fixtures');

describe('sweeper', function() {
  
  let config = require('../src/config');
  let builder = require('../src/builder');
  let git = require('../src/git');
  let sweeper = require('../src/sweeper');
  
  let fix = fixtures();
  let fixed = {
    proj: [
      { kind: 'projects', proj: 'helloworld', when: moment('20130420T235959', moment.compactFormat) },
    ],
    lab: [
      { kind: 'labs', proj: 'lab1', when: moment('20130220T171500', moment.compactFormat) },
      { kind: 'labs', proj: 'lab1', when: moment('20130221T171500', moment.compactFormat) },
      { kind: 'labs', proj: 'lab2', when: moment('20130320T171500', moment.compactFormat) },
      { kind: 'labs', proj: 'lab2', when: moment('20130321T171500', moment.compactFormat) },
    ]
  };
  let sandbox = sinon.sandbox.create();
  
  before(function(done) {
    fix.files(this.test, done);
  });
  
  afterEach(function() {
    sandbox.restore();
  });
  
  describe('findSweeps', function() {
    it('should return sweep specifications', function(done) {
      sweeper.findSweeps({}, function(err, specs) {
        specs.should.eql(fixed.lab.concat(fixed.proj));
        done(err);
      });
    });
    it('kind restriction should limit sweeps', function(done) {
      sweeper.findSweeps({ kind: 'projects' }, function(err, specs) {
        specs.should.eql(fixed.proj);
        done(err);
      });
    });
    it('proj restriction should limit sweeps', function(done) {
      sweeper.findSweeps({ proj: 'lab1' }, function(err, specs) {
        specs.should.eql(fixed.lab.slice(0, 2));
        done(err);
      });
    });
    it('should fail with filesystem error', function(done) {
      let stub = sandbox.stub(fs, 'readdir').yields(new Error());
      sandbox.stub(console, 'error');
      sweeper.findSweeps({ kind: 'labs' }, function(err, specs) {
        stub.called.should.be.true();
        should.exist(err);
        done();
      });
    });
  });
  
  describe('findSweep', function() {
    
    let specs = [
      { "kind": "labs", "proj": "lab2", "users": [ "alice" ], "rev": "abcd123" },
      { "kind": "labs", "proj": "lab2", "users": [ "alice" ], "rev": "abcd456" }
    ];
    
    it('should return a sweep', function(done) {
      sweeper.findSweep({ kind: 'labs', proj: 'lab2', datetime: fixed.lab[2].when }, function(err, sweep) {
        sweep.reporevs.should.have.length(1);
        sweep.reporevs[0].should.containEql(specs[0]);
        sweep.reporevs[0].grade.score.should.eql(50);
        done(err);
      });
    });
    it('should return a sweep with no grades', function(done) {
      sweeper.findSweep({ kind: 'labs', proj: 'lab2', datetime: fixed.lab[3].when }, function(err, sweep) {
        sweep.reporevs.should.have.length(1);
        sweep.reporevs[0].should.containEql(specs[1]);
        should.not.exist(sweep.reporevs[0].grade);
        done(err);
      });
    });
    it('should fail with no sweep', function(done) {
      sweeper.findSweep({ kind: 'labs', proj: 'lab2', datetime: fixed.lab[3].when.clone().add(1, 'day') }, function(err, sweep) {
        err.should.be.an.instanceof(Error);
        should.not.exist(sweep);
        done();
      });
    });
    it('should fail with invalid sweep file', function(done) {
      sweeper.findSweep({ kind: 'labs', proj: 'lab1', datetime: fixed.lab[0].when }, function(err, sweep) {
        err.should.be.an.instanceof(Error);
        should.not.exist(sweep);
        done();
      });
    });
    it('should fail with invalid grades file', function(done) {
      sweeper.findSweep({ kind: 'labs', proj: 'lab1', datetime: fixed.lab[1].when }, function(err, sweep) {
        err.should.be.an.instanceof(Error);
        should.not.exist(sweep);
        done();
      });
    });
  });
  
  describe('scheduleSweep', function() {
    
    let spec = { kind: 'labs' };
    
    it('should sweep at a past time', function(done) {
      let when = moment().subtract(1, 'hour');
      sandbox.stub(sweeper, 'startSweep', function(spec, when, startCallback, finishCallback) {
        startCallback(null, 'repos');
        process.nextTick(async.apply(finishCallback, null, 'grades'));
      });
      let spy = sinon.spy();
      sweeper.scheduleSweep(spec, when, spy, spy, function(err, grades) {
        sweeper.startSweep.calledWith(spec, when).should.be.true();
        spy.args.should.eql([ [], [ null, 'repos' ] ]);
        grades.should.eql('grades');
        done(err);
      });
    });
    it('should sweep at a future time', function(done) {
      let when = moment().add(1, 'hour');
      sandbox.useFakeTimers('setTimeout');
      sandbox.stub(sweeper, 'startSweep', function(spec, when, startCallback, finishCallback) {
        startCallback(null, 'repos');
        process.nextTick(async.apply(finishCallback, null, 'grades'));
      });
      let spy = sinon.spy();
      sweeper.scheduleSweep(spec, when, function() {
        sandbox.clock.tick(1000 * 60 * 30);
        sweeper.startSweep.called.should.be.false();
        sandbox.clock.tick(1000 * 60 * 30);
      }, spy, function(err, grades) {
        sweeper.startSweep.calledWith(spec, when).should.be.true();
        spy.args.should.eql([ [ null, 'repos' ] ]);
        grades.should.eql('grades');
        done(err);
      });
    });
    it('should fail when future time is too distant', function(done) {
      sandbox.stub(sweeper, 'startSweep').throws();
      sweeper.scheduleSweep(spec, moment().add(1, 'month'), function(err) {
        should.exist(err);
        sweeper.scheduledSweeps(spec, function(serr, sweeps) {
          sweeps.should.have.length(0);
          done(serr);
        });
      });
    });
  });
  
  describe('scheduledSweeps', function() {
    
    let when = [ moment().subtract(1, 'day'), moment(), moment().add(1, 'day') ];
    
    it('should return sweep specifications', function(done) {
      sandbox.useFakeTimers('setTimeout');
      sweeper.scheduleSweep({ kind: 'labs', proj: 'hello' }, when[0], function() {});
      sweeper.scheduleSweep({ kind: 'labs', proj: 'goodbye' }, when[1], function() {});
      sweeper.scheduleSweep({ kind: 'projects', proj: 'goodbye' }, when[2], function() {});
      sweeper.scheduledSweeps({ kind: 'labs', proj: 'goodbye' }, function(err, sweeps) {
        sweeps.should.eql([ { kind: 'labs', proj: 'goodbye', when: when[1] } ]);
        done(err);
      });
    });
  });
  
  describe('startSweep', function() {
    
    let specs = {
      sweep: { kind: 'labs', proj: 'lab0' },
      repos() { return [
        { kind: 'labs', proj: 'lab0', users: [ 'alice' ] },
        { kind: 'labs', proj: 'lab0', users: [ 'bob' ] },
        { kind: 'labs', proj: 'lab0', users: [ 'charlie' ] }
      ]; }
    };
    let revs = { alice: 'abcd123' };
    let resultdir = path.join(
      config.build.results, 'sweeps', specs.sweep.kind, specs.sweep.proj
    );
    
    beforeEach(function(done) {
      fix.files(this.currentTest, done);
      sandbox.stub(git, 'findStudentRepos').yields(null, specs.repos());
      sandbox.stub(git, 'builderRev').yields(null, 'f1f2f3f');
    });
    
    afterEach(function(done) {
      rimraf(resultdir, done);
    });
    
    it('should return repositories to sweep', function(done) {
      sweeper.startSweep(specs.sweep, moment(), function(err, repos) {
        should.not.exist(err);
        repos.should.eql(specs.repos());
      }, done);
    });
    it('should return grade reports from sweep', function(done) {
      sandbox.stub(git, 'studentSourceRevAt').yields(null, '0000000');
      sandbox.stub(builder, 'findBuild', function(spec, callback) {
        callback(null, { json: { grade: { spec, score: 75 } } });
      });
      sweeper.startSweep(specs.sweep, moment(), function() {}, function(err, grades) {
        grades.should.eql(specs.repos().map(function(spec) {
          spec.rev = '0000000';
          return { spec, score: 75 };
        }));
        done(err);
      });
    });
    it('should record revisions', function(done) {
      let now = moment();
      sandbox.stub(git, 'studentSourceRevAt', function(spec, when, callback) {
        when.should.equal(now);
        let rev = revs[spec.users[0]];
        callback(rev ? null : new Error(), rev);
      });
      sandbox.stub(builder, 'findBuild').yields(new Error());
      sandbox.stub(builder, 'startBuild').yields(new Error());
      sweeper.startSweep(specs.sweep, now, function() {}, function(err) {
        let result = JSON.parse(fs.readFileSync(path.join(resultdir, now.format(moment.compactFormat), 'sweep.json')));
        result.reporevs.should.containEql({ kind: 'labs', proj: 'lab0', users: [ 'alice' ], rev: 'abcd123' });
        result.reporevs.should.containEql({ kind: 'labs', proj: 'lab0', users: [ 'bob' ], rev: null });
        done();
      });
    });
    it('should trigger builds', function(done) {
      sandbox.stub(git, 'studentSourceRevAt').yields(null, '0000000');
      sandbox.stub(builder, 'findBuild', function(spec, callback) {
        fix.readFile(spec.users[0] + '.json', function(err, data) {
          if (err) { return callback(err); }
          callback(null, JSON.parse(data));
        });
      });
      sandbox.stub(builder, 'startBuild').yields(null, 'fake');
      sandbox.stub(builder, 'monitor', function() {
        let emitter = new events.EventEmitter();
        process.nextTick(function() { emitter.emit('done'); });
        return emitter;
      });
      sweeper.startSweep(specs.sweep, moment(), function() {}, function(err) {
        builder.startBuild.calledWithMatch({ users: [ 'alice' ] }).should.be.false();
        builder.startBuild.calledWithMatch({ users: [ 'bob' ] }).should.be.true();
        builder.startBuild.calledWithMatch({ users: [ 'charlie' ] }).should.be.true();
        done(err);
      });
    });
    it('should sort repositories', function(done) {
      git.findStudentRepos.yields(null, [
        [ 'bob' ], [ 'alice', 'zach' ], [ 'eve' ], [ 'yolanda' ]
      ].map(function(users) { return { users }; }));
      sandbox.stub(git, 'studentSourceRevAt').yields(null, '0000000');
      sandbox.stub(builder, 'findBuild', function(spec, callback) {
        callback(null, { json: { grade: { spec } } });
      });
      sweeper.startSweep(specs.sweep, moment(), function() {}, function(err, grades) {
        grades.map(function(grade) { return grade.spec.users; }).should.eql([
          [ 'alice', 'zach' ], [ 'bob' ], [ 'yolanda' ], [ 'eve' ]
        ]);
        done(err);
      });
    });
  });
});
