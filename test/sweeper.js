var moment = require('moment');

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
});
