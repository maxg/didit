var async = require('async');
var path = require('path');
var temp = require('temp');

var fixtures = require('./fixtures');

describe('ant', function() {
  
  var ant = require('../ant');
  
  var fix = fixtures();
  var nospec = { ignored: true };
  
  beforeEach(function(done) {
    fix.files(this.currentTest, done);
  });
  
  afterEach(function() {
    fix.forget();
  });
  
  describe('compile', function() {
    it('should run the compile target', function(done) {
      ant.compile(nospec, fix.fixdir, 'compile', path.join(fix.fixdir, 'out'), function(err, result) {
        fix.readFile('out.txt', function(fserr, data) {
          result.success.should.be.true;
          data.should.match(/\[echo\] compiling/).and.match(/BUILD SUCCESSFUL/);
          done(err || fserr);
        });
      });
    });
    it('should provide Java', function(done) {
      ant.compile(nospec, fix.fixdir, 'compile', path.join(fix.fixdir, 'out'), function(err, result) {
        fix.readFile('out.txt', function(fserr, data) {
          result.success.should.be.true;
          data.should.match(/junit\.jar/);
          done(err || fserr);
        });
      })
    });
    it('should return false with invalid build file', function(done) {
      ant.compile(nospec, fix.fixdir, 'compile', path.join(fix.fixdir, 'out'), function(err, result) {
        result.success.should.be.false;
        done(err);
      });
    });
    it('should return false when build fails', function(done) {
      ant.compile(nospec, fix.fixdir, 'compile', path.join(fix.fixdir, 'out'), function(err, result) {
        fix.readFile('out.txt', function(fserr, data) {
          result.success.should.be.false;
          data.should.match(/BUILD FAILED/);
          done(err || fserr);
        });
      });
    });
  });
  
  describe('test', function() {
    it('should run the test target', function(done) {
      ant.test(nospec, fix.fixdir, 'test', path.join(fix.fixdir, 'out'), function(err, result) {
        fix.readFile('out.txt', function(fserr, data) {
          data.should.match(/\[echo\] testing/).and.match(/BUILD SUCCESSFUL/);
          done(err || fserr);
        });
      });
    });
    it('should return results', function(done) {
      ant.test(nospec, fix.fixdir, 'test', path.join(fix.fixdir, 'out'), function(err, result) {
        result.success.should.be.false;
        result.result.tests.should.equal(0);
        result.result.failures.should.equal(0);
        result.result.errors.should.equal(0);
        result.result.testsuites.should.eql([]);
        done(err);
      });
    });
    it('should record results', function(done) {
      ant.test(nospec, fix.fixdir, 'test', path.join(fix.fixdir, 'out'), function(err, result) {
        fix.readFile('out.json', function(fserr, data) {
          result.success.should.be.true;
          var json = JSON.parse(data);
          json.tests.should.equal(1);
          json.failures.should.equal(0);
          json.errors.should.equal(0);
          json.testsuites.should.have.length(1);
          var suite = json.testsuites[0];
          suite.name.should.equal('OnePass');
          json.tests.should.equal(1);
          json.failures.should.equal(0);
          json.errors.should.equal(0);
          suite.testcases.should.have.length(1);
          suite.sysout.should.eql([ 'text on stdout\n' ]);
          suite.syserr.should.eql([ 'text on stderr\n' ]);
          var test = suite.testcases[0];
          test.classname.should.equal('OnePass');
          test.name.should.equal('pass');
          done(err || fserr);
        });
      });
    });
    it('should fail with invalid test output', function(done) {
      ant.test(nospec, fix.fixdir, 'test', path.join(fix.fixdir, 'out'), function(err, result) {
        fix.readFile('out.txt', function(fserr, data) {
          result.success.should.be.false;
          data.should.match(/BUILD SUCCESSFUL/);
          done(err || fserr);
        });
      });
    });
    it('should return false when build fails', function(done) {
      ant.test(nospec, fix.fixdir, 'test', path.join(fix.fixdir, 'out'), function(err, result) {
        async.parallel([
          function(next) {
            fix.readFile('TESTS-TestSuites.xml', function(fserr, data) {
              data.should.match(/tests="1"/);
              next(fserr);
            });
          },
          function(next) {
            fix.readFile('out.json', function(fserr, data) {
              result.success.should.be.false;
              var json = JSON.parse(data);
              json.tests.should.equal(0);
              json.failures.should.equal(0);
              json.errors.should.equal(0);
              next(fserr || err);
            });
          }
        ], done);
      });
    });
    it('should return false when tests fail', function(done) {
      ant.test(nospec, fix.fixdir, 'test', path.join(fix.fixdir, 'out'), function(err, result) {
        fix.readFile('out.json', function(fserr, data) {
          result.success.should.be.false;
          var json = JSON.parse(data);
          json.tests.should.equal(1);
          json.failures.should.equal(1);
          json.errors.should.equal(0);
          done(err || fserr);
        });
      });
    });
    it('should return false when no tests run', function(done) {
      ant.test(nospec, fix.fixdir, 'test', path.join(fix.fixdir, 'out'), function(err, result) {
        fix.readFile('out.json', function(fserr, data) {
          result.success.should.be.false;
          var json = JSON.parse(data);
          json.tests.should.equal(0);
          json.failures.should.equal(0);
          json.errors.should.equal(0);
          done(err || fserr);
        });
      });
    });
  });
  
  describe('parseJUnitResults', function() {
    it('should handle multiple testsuites', function(done) {
      ant.parseJUnitResults(0, path.join(fix.fixdir, 'TESTS-TestSuites.xml'), function(err, result) {
        result.tests.should.equal(3);
        result.failures.should.equal(1);
        result.errors.should.equal(1);
        result.testsuites.should.have.length(3);
        done(err);
      });
    });
    it('should handle no testsuites', function(done) {
      ant.parseJUnitResults(0, path.join(fix.fixdir, 'TESTS-TestSuites.xml'), function(err, result) {
        result.tests.should.equal(0);
        result.failures.should.equal(0);
        result.errors.should.equal(0);
        result.testsuites.should.eql([]);
        done(err);
      });
    });
    it('should handle empty testsuites', function(done) {
      ant.parseJUnitResults(0, path.join(fix.fixdir, 'TESTS-TestSuites.xml'), function(err, result) {
        result.tests.should.equal(0);
        result.failures.should.equal(0);
        result.errors.should.equal(0);
        result.testsuites.should.have.length(1);
        var suite = result.testsuites[0];
        suite.name.should.equal('Only');
        suite.testcases.should.have.length(0);
        done(err);
      });
    });
    it('should handle missing system-out', function(done) {
      ant.parseJUnitResults(0, path.join(fix.fixdir, 'TESTS-TestSuites.xml'), function(err, result) {
        result.testsuites[0].sysout.should.eql([]);
        result.testsuites[0].syserr.should.eql([ 'text on stderr\n' ]);
        done(err);
      });
    });
    it('should handle missing system-err', function(done) {
      ant.parseJUnitResults(0, path.join(fix.fixdir, 'TESTS-TestSuites.xml'), function(err, result) {
        result.testsuites[0].sysout.should.eql([ 'text on stdout\n' ]);
        result.testsuites[0].syserr.should.eql([]);
        done(err);
      });
    });
    it('should report errors and failures', function(done) {
      var expected = {
        Failure: /junit.framework.AssertionFailedError/,
        Error: /java.lang.Error/
      };
      ant.parseJUnitResults(0, path.join(fix.fixdir, 'TESTS-TestSuites.xml'), function(err, result) {
        result.testsuites.should.have.length(2);
        result.testsuites.forEach(function(suite) {
          suite.testcases.should.have.length(1);
          suite.testcases[0][suite.name.toLowerCase()].should.match(expected[suite.name]);
        });
        done(err);
      });
    });
    it('should report didit properties', function(done) {
      ant.parseJUnitResults(0, path.join(fix.fixdir, 'TESTS-TestSuites.xml'), function(err, result) {
        result.testsuites[0].properties['test.property'].should.equal('testing');
        done(err);
      });
    });
  });
});
