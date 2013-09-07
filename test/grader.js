var fs = require('fs');
var path = require('path');
var sinon = require('sinon');

var fixtures = require('./fixtures');

describe('grader', function() {
  
  var grader = require('../grader');
  
  var fix = fixtures();
  var sandbox = sinon.sandbox.create();
  var nospec = { ignored: true };
  
  beforeEach(function(done) {
    fix.files(this.currentTest, done);
  });
  
  afterEach(function() {
    fix.forget();
    sandbox.restore();
  });
  
  describe('parseGradeSheet', function() {
    it('should return an array of test specs', function(done) {
      grader.parseGradeSheet(path.join(fix.fixdir, 'gradesheet.csv'), function(err, rows) {
        rows.should.eql([
          { pkg: 'pkg', cls: 'FirstTest', test: 'testOne', pts: '5' },
          { pkg: 'pkg', cls: 'FirstTest', test: 'testTwo', pts: '10' },
          { pkg: '', cls: 'SecondTest', test: 'testThree', pts: '5' },
          { pkg: '', cls: 'SecondTest', test: 'testFour', pts: '10' }
        ]);
        done(err);
      });
    });
    it('should ignore non-JUnit rows', function(done) {
      grader.parseGradeSheet(path.join(fix.fixdir, 'gradesheet.csv'), function(err, rows) {
        rows.should.eql([
          { pkg: 'pkg', cls: 'SpecTest', test: 'testZero', pts: '5' }
        ]);
        done(err);
      });
    });
    it('should ignore empty grade sheet', function(done) {
      grader.parseGradeSheet(path.join(fix.fixdir, 'gradesheet.csv'), function(err, rows) {
        rows.should.eql([]);
        done(err);
      });
    });
    it('should fail with invalid grade sheet', function(done) {
      grader.parseGradeSheet(path.join(fix.fixdir, 'gradesheet.csv'), function(err, rows) {
        err.should.exist;
        done();
      });
    });
  });
  
  describe('grade', function() {
    it('should ignore missing grade sheet', function(done) {
      sandbox.stub(grader, 'parseGradeSheet').throws();
      grader.grade(nospec, fix.fixdir, {}, path.join(fix.fixdir, 'grade'), function(err, report) {
        report.should.eql({ spec: nospec, score: 0, outof: 0, testsuites: [] });
        done(err);
      });
    });
    it('should ignore invalid grade sheet', function(done) {
      sandbox.stub(grader, 'parseGradeSheet').yields(new Error(), null);
      grader.grade(nospec, fix.fixdir, {}, path.join(fix.fixdir, 'grade'), function(err, report) {
        report.should.eql({ spec: nospec, score: 0, outof: 0, testsuites: [] });
        done(err);
      });
    });
    it('should return results', function(done) {
      grader.grade(nospec, fix.fixdir, {
        json: { hidden: { testsuites: [
          { package: 'pkg', name: 'SecondTest', properties: {}, testcases: [
            { name: 'testTwo' }, { name: 'testThree' }
          ] }
        ] } }
      }, path.join(fix.fixdir, 'grade'), function(err, report) {
        report.score.should.equal(10);
        report.outof.should.equal(20);
        report.testsuites.should.includeEql({
          package: 'pkg', name: 'FirstTest', missing: true, testcases: [
            { name: 'testOne', missing: true, grade: { score: 0, outof: 10 } }
          ]
        });
        report.testsuites.should.includeEql({
          package: 'pkg', name: 'SecondTest', properties: {}, testcases: [
            { name: 'testTwo', grade: { score: 10, outof: 10 } }
          ]
        });
        done(err);
      });
    });
    it('should record results', function(done) {
      grader.grade(nospec, fix.fixdir, {
        json: { hidden: { testsuites: [
          { package: 'pkg', name: 'FirstTest', properties: {}, testcases: [ { name: 'testOne' } ] },
          { package: 'pkg', name: 'SecondTest', properties: {}, testcases: [ { name: 'testTwo' } ] }
        ] } }
      }, path.join(fix.fixdir, 'grade'), function(err, report) {
        fix.readFile('grade.json', function(fserr, data) {
          report.score.should.equal(20);
          report.outof.should.equal(20);
          JSON.parse(data).should.eql(report);
          done(err || fserr);
        });
      });
    });
  });
});
