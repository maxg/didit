var async = require('async');
var events = require('events');
var fs = require('fs');
var moment = require('moment');
var path = require('path');
var rimraf = require('rimraf');
var should = require('should');
var sinon = require('sinon');

var fixtures = require('./fixtures');

describe('sweeper', function() {
  
  var config = require('../config');
  var builder = require('../builder');
  var git = require('../git');
  var sweeper = require('../sweeper');
  
  var fix = fixtures();
  var fixed = {
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
  var sandbox = sinon.sandbox.create();
  
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
  });
  
  describe('findSweep', function() {
    
    var specs = [
      { "kind": "labs", "proj": "lab2", "users": [ "alice" ], "rev": "abcd123" },
      { "kind": "labs", "proj": "lab2", "users": [ "alice" ], "rev": "abcd456" }
    ];
    
    it('should return a sweep', function(done) {
      sweeper.findSweep({ kind: 'labs', proj: 'lab2', datetime: fixed.lab[2].when }, function(err, sweep) {
        sweep.reporevs.should.have.length(1);
        sweep.reporevs[0].should.include(specs[0]);
        sweep.reporevs[0].grade.score.should.eql(50);
        done(err);
      });
    });
    it('should return a sweep with no grades', function(done) {
      sweeper.findSweep({ kind: 'labs', proj: 'lab2', datetime: fixed.lab[3].when }, function(err, sweep) {
        sweep.reporevs.should.have.length(1);
        sweep.reporevs[0].should.include(specs[1]);
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
    
    var spec = { kind: 'labs' };
    
    it('should sweep at a past time', function(done) {
      var when = moment().subtract(1, 'hour');
      sandbox.stub(sweeper, 'startSweep', function(spec, when, startCallback, finishCallback) {
        startCallback(null, 'repos');
        process.nextTick(async.apply(finishCallback, null, 'grades'));
      });
      var spy = sinon.spy();
      sweeper.scheduleSweep(spec, when, spy, spy, function(err, grades) {
        sweeper.startSweep.calledWith(spec, when).should.be.true;
        spy.args.should.eql([ [], [ null, 'repos' ] ]);
        grades.should.eql('grades');
        done(err);
      });
    });
    it('should sweep at a future time', function(done) {
      var when = moment().add(1, 'hour');
      sandbox.useFakeTimers('setTimeout');
      sandbox.stub(sweeper, 'startSweep', function(spec, when, startCallback, finishCallback) {
        startCallback(null, 'repos');
        process.nextTick(async.apply(finishCallback, null, 'grades'));
      });
      var spy = sinon.spy();
      sweeper.scheduleSweep(spec, when, function() {
        sandbox.clock.tick(1000 * 60 * 30);
        sweeper.startSweep.called.should.be.false;
        sandbox.clock.tick(1000 * 60 * 30);
      }, spy, function(err, grades) {
        sweeper.startSweep.calledWith(spec, when).should.be.true;
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
    
    var when = [ moment().subtract(1, 'day'), moment(), moment().add(1, 'day') ];
    
    it('should return sweep specifications', function(done) {
      sandbox.stub(sweeper, 'startSweep');
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
    
    var specs = {
      sweep: { kind: 'labs', proj: 'lab0' },
      repos: function() { return [
        { kind: 'labs', proj: 'lab0', users: [ 'alice' ] },
        { kind: 'labs', proj: 'lab0', users: [ 'bob' ] },
        { kind: 'labs', proj: 'lab0', users: [ 'charlie' ] }
      ]; }
    };
    var revs = { alice: 'abcd123' };
    var resultdir = path.join(
      config.build.results, 'sweeps', config.student.semester,
      specs.sweep.kind, specs.sweep.proj
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
        repos.should.eql(specs.repos());
      }, done);
    });
    it('should return grade reports from sweep', function(done) {
      sandbox.stub(git, 'studentSourceRevAt').yields(null, '0000000');
      sandbox.stub(builder, 'findBuild', function(spec, callback) {
        callback(null, { json: { grade: { spec: spec, score: 75 } } });
      });
      sweeper.startSweep(specs.sweep, moment(), function() {}, function(err, grades) {
        grades.should.eql(specs.repos().map(function(spec) {
          spec.rev = '0000000';
          return { spec: spec, score: 75 };
        }));
        done(err);
      });
    });
    it('should record revisions', function(done) {
      var now = moment();
      sandbox.stub(git, 'studentSourceRevAt', function(spec, when, callback) {
        when.should.equal(now);
        var rev = revs[spec.users[0]];
        callback(rev ? null : new Error(), rev);
      });
      sandbox.stub(builder, 'findBuild').yields(new Error());
      sandbox.stub(builder, 'startBuild').yields(new Error());
      sweeper.startSweep(specs.sweep, now, function() {}, function(err) {
        var result = JSON.parse(fs.readFileSync(path.join(resultdir, now.format(moment.compactFormat), 'sweep.json')));
        result.reporevs.should.includeEql({ kind: 'labs', proj: 'lab0', users: [ 'alice' ], rev: 'abcd123' });
        result.reporevs.should.includeEql({ kind: 'labs', proj: 'lab0', users: [ 'bob' ], rev: null });
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
        var emitter = new events.EventEmitter();
        process.nextTick(function() { emitter.emit('done'); });
        return emitter;
      });
      sweeper.startSweep(specs.sweep, moment(), function() {}, function(err) {
        builder.startBuild.calledWithMatch({ users: [ 'alice' ] }).should.be.false;
        builder.startBuild.calledWithMatch({ users: [ 'bob' ] }).should.be.true;
        builder.startBuild.calledWithMatch({ users: [ 'charlie' ] }).should.be.true;
        done(err);
      });
    });
  });
});
