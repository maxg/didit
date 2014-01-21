var moment = require('moment');
var should = require('should');

var fixtures = require('./fixtures');

describe('sweeper', function() {
  
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
  
  before(function(done) {
    fix.files(this.test, done);
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
});
