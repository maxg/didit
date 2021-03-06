const async = require('async');
const fs = require('fs');
const path = require('path');
const should = require('should');
const sinon = require('sinon');

const fixtures = require('./fixtures');

describe('grader', function() {
  
  let git = require('../src/git');
  let grader = require('../src/grader');
  
  let fix = fixtures();
  let sandbox = sinon.sandbox.create();
  let nospec = { ignored: true };
  
  before(function(done) {
    fix.files(this.test, done);
  });
  
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
    it('should handle whitespace', function(done) {
      grader.parseGradeSheet(path.join(fix.fixdir, 'gradesheet.csv'), function(err, rows) {
        rows.should.eql([
          { pkg: 'pkg', cls: 'FirstTest', test: ' testOne Two Three ', pts: '5' },
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
        should.exist(err);
        done();
      });
    });
  });
  
  describe('grade', function() {
    it('should ignore missing grade sheet', function(done) {
      sandbox.stub(grader, 'parseGradeSheet').throws();
      grader.grade(nospec, fix.fixdir, {}, path.join(fix.fixdir, 'grade'), function(err, report) {
        grader.parseGradeSheet.called.should.be.false();
        report.should.eql({ spec: nospec, score: 0, outof: 0, testsuites: [], ungraded: [] });
        done(err);
      });
    });
    it('should ignore invalid grade sheet', function(done) {
      sandbox.stub(grader, 'parseGradeSheet').yields(new Error(), null);
      grader.grade(nospec, fix.fixdir, {}, path.join(fix.fixdir, 'grade'), function(err, report) {
        grader.parseGradeSheet.called.should.be.true();
        report.should.eql({ spec: nospec, score: 0, outof: 0, testsuites: [], ungraded: [] });
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
        report.testsuites.should.eql([
          { package: 'pkg', name: 'FirstTest', missing: true, testcases: [
            { name: 'testOne', missing: true, grade: { pass: false, score: 0, outof: 10 } }
          ] },
          { package: 'pkg', name: 'SecondTest', properties: {}, testcases: [
            { name: 'testTwo', grade: { pass: true, score: 10, outof: 10 } }
          ] }
        ]);
        report.ungraded.should.eql([
          { package: 'pkg', name: 'SecondTest', properties: {}, testcases: [
            { name: 'testThree', grade: { pass: true, score: 0, outof: 0 } }
          ] }
        ]);
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
  
  describe('findTest', function() {
    it('should return a test result', function(done) {
      fix.readFile('build.json', function(err, data) {
        let build = JSON.parse(data);
        async.map([
          [ 'public', 'SuiteGood', 'testTwo' ],
          [ 'public', 'SuiteEvil', 'testTwo' ],
          [ 'hidden', 'SuiteMean', 'testOne' ]
        ], function(args, next) {
          grader.findTest.apply(grader, [ build ].concat(args, next));
        }, function(err, results) {
          results.should.eql([
            build.json.public.testsuites[0].testcases[1],
            build.json.public.testsuites[1].testcases[1],
            build.json.hidden.testsuites[1].testcases[0]
          ]);
          done(err);
        });
      });
    });
    it('should fail with missing test', function(done) {
      fix.readFile('build.json', function(err, data) {
        grader.findTest(JSON.parse(data), 'public', 'SuiteEvil', 'testOne', function(err, test) {
          should.exist(err);
          should.not.exist(test);
          done();
        });
      });
    });
    it('should fail with missing suite', function(done) {
      fix.readFile('build.json', function(err, data) {
        grader.findTest(JSON.parse(data), 'public', 'SuiteEvil', 'testOne', function(err, test) {
          should.exist(err);
          should.not.exist(test);
          done();
        });
      });
    });
    it('should fail with missing category', function(done) {
      fix.readFile('build.json', function(err, data) {
        grader.findTest(JSON.parse(data), 'public', 'SuiteKind', 'testOne', function(err, test) {
          should.exist(err);
          should.not.exist(test);
          done();
        });
      });
    });
  });
  
  describe('isMilestoneReleasedSync', function() {
    it('should return true for released milestone', function() {
      grader.isMilestoneReleasedSync({ kind: 'labs', proj: 'lab3' }, 'beta').should.be.true();
    });
    it('should return false for un-released milestone', function() {
      grader.isMilestoneReleasedSync({ kind: 'labs', proj: 'lab3' }, 'final').should.be.false();
    });
    it('should return false for missing milestone', function() {
      grader.isMilestoneReleasedSync({ kind: 'labs', proj: 'lab3' }, 'alpha').should.be.false();
    });
  });
  
  describe('findMilestones', function() {
    it('should return milestone specifications', function(done) {
      grader.findMilestones({ kind: '*', proj: '*' }, function(err, milestones) {
        milestones.should.eql([
          { kind: 'labs', proj: 'lab3', name: 'beta', released: true },
          { kind: 'labs', proj: 'lab3', name: 'final', released: false },
          { kind: 'labs', proj: 'lab4', name: 'beta', released: false },
          { kind: 'projects', proj: 'helloworld', name: 'test', released: true }
        ]);
        done(err);
      });
    });
    it('kind restriction should limit milestones', function(done) {
      grader.findMilestones({ kind: 'labs', proj: '*' }, function(err, milestones) {
        milestones.should.eql([
          { kind: 'labs', proj: 'lab3', name: 'beta', released: true },
          { kind: 'labs', proj: 'lab3', name: 'final', released: false },
          { kind: 'labs', proj: 'lab4', name: 'beta', released: false }
        ]);
        done(err);
      });
    });
    it('proj restriction should limit milestones', function(done) {
      grader.findMilestones({ kind: '*', proj: 'lab3' }, function(err, milestones) {
        milestones.should.eql([
          { kind: 'labs', proj: 'lab3', name: 'beta', released: true },
          { kind: 'labs', proj: 'lab3', name: 'final', released: false }
        ]);
        done(err);
      });
    });
    it('should fail with filesystem error', function(done) {
      let stub = sandbox.stub(fs, 'readdir').yields(new Error());
      sandbox.stub(console, 'error');
      grader.findMilestones({ kind: 'labs' }, function(err, found) {
        stub.called.should.be.true();
        should.exist(err);
        done();
      });
    });
  });
  
  describe('findMilestone', function() {
    it('return should include graded projects', function(done) {
      let spec = { kind: 'labs', proj: 'lab3', users: [ 'alice' ] };
      sandbox.stub(git, 'findStudentRepos').yields(null, [ spec ]);
      grader.findMilestone({ kind: 'labs', proj: 'lab3' }, 'beta', function(err, milestone) {
        milestone.should.containEql({ kind: 'labs', proj: 'lab3', name: 'beta' });
        milestone.released.should.be.true();
        milestone.reporevs.should.have.length(1);
        milestone.reporevs[0].should.containEql(spec);
        let grade = milestone.reporevs[0].grade;
        grade.spec.should.eql({ kind: 'labs', proj: 'lab3', users: [ 'alice' ], rev: 'abcd789' });
        grade.score.should.equal(5);
        grade.outof.should.equal(15);
        grade.testsuites.should.have.length(2);
        done(err);
      });
    });
    it('return should include ungraded projects', function(done) {
      let spec = { kind: 'labs', proj: 'lab3', users: [ 'mystery' ] };
      sandbox.stub(git, 'findStudentRepos').yields(null, [ spec ]);
      grader.findMilestone({ kind: 'labs', proj: 'lab3' }, 'final', function(err, milestone) {
        milestone.should.containEql({ kind: 'labs', proj: 'lab3', name: 'final' });
        milestone.released.should.be.false();
        milestone.reporevs.should.have.length(1);
        milestone.reporevs[0].should.eql(spec);
        done(err);
      });
    });
    it('should sort repositories', function(done) {
      sandbox.stub(git, 'findStudentRepos').yields(null, [
        [ 'bob' ], [ 'alice', 'zach' ], [ 'eve' ], [ 'yolanda' ]
      ].map(function(users) { return { users }; }));
      grader.findMilestone({ kind: 'labs', proj: 'lab3' }, 'beta', function(err, milestone) {
        milestone.reporevs.map(function(reporev) { return reporev.users; }).should.eql([
          [ 'alice' ], [ 'bob' ], [ 'yolanda' ], [ 'zach' ], [ 'eve' ]
        ]);
        done(err);
      });
    });
    it('should fail with invalid grade file', function(done) {
      let spec = { kind: 'labs', proj: 'lab3', users: [ 'charlie' ] };
      sandbox.stub(git, 'findStudentRepos').yields(null, [ spec ]);
      grader.findMilestone({ kind: 'labs', proj: 'lab3' }, 'beta', function(err, milestone) {
        err.should.be.an.instanceof(Error);
        done();
      });
    });
  });
  
  describe('findMilestoneGrade', function() {
    it('should return milestone grade report', function(done) {
      grader.findMilestoneGrade({ kind: 'labs', proj: 'lab3', users: [ 'alice' ] }, 'beta', function(err, report) {
        fix.readFile('alice.json', function(fserr, data) {
          report.should.eql(JSON.parse(data));
          done(err || fserr);
        });
      });
    });
    it('should fail with missing report', function(done) {
      grader.findMilestoneGrade({ kind: 'labs', proj: 'lab3', users: [ 'bob' ] }, 'beta', function(err, report) {
        err.should.be.an.instanceof(Error);
        should.not.exist(report);
        done();
      });
    });
    it('should fail with invalid report', function(done) {
      grader.findMilestoneGrade({ kind: 'labs', proj: 'lab3', users: [ 'charlie' ] }, 'beta', function(err, report) {
        err.should.be.an.instanceof(Error);
        should.not.exist(report);
        done();
      });
    });
  });
  
  describe('createMilestone', function() {
    it('should create a new milestone', function(done) {
      grader.createMilestone({ kind: 'tests', proj: 'valid' }, 'test', function(err) {
        grader.findMilestones({}, function(finderr, milestones) {
          milestones.should.containEql({
            kind: 'tests', proj: 'valid', name: 'test', released: false
          });
          done(err || finderr);
        });
      });
    });
    it('should fail with invalid name', function(done) {
      async.each([ ' ', '.', 'te/st', '$test' ], function(name, next) {
        grader.createMilestone({ kind: 'tests', proj: 'invalid' }, name, function(err) {
          should.exist(err);
          next();
        });
      }, function() {
        grader.findMilestones({}, function(err, milestones) {
          milestones.forEach(function(milestone) {
            milestone.should.not.containEql({ proj: 'invalid' });
          });
          done(err);
        });
      });
    });
  });
});
