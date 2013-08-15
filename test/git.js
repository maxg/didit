var fixtures = require('./fixtures');

describe('git', function() {
  
  var git = require('../git');
  
  var fix = fixtures();
  
  before(function(done) {
    fix.files(this.test, done);
  });
  
  beforeEach(function(done) {
    fix.files(this.currentTest, done);
  });
  
  afterEach(function() {
    fix.forget();
  });
  
  describe('studentSourceLog', function() {
    it('should return a full commit log', function(done) {
      git.studentSourceLog({ kind: 'labs', proj: 'lab1', users: [ 'alice' ]}, [], function(err, lines) {
        lines.map(function(line) {
          return { rev: line.rev, msg: line.subject };
        }).should.eql([
          { rev: '236e692', msg: 'Less salutatory' },
          { rev: 'cb138ec', msg: 'Initial version' }
        ]);
        done(err);
      });
    });
    it('should return a single commit log', function(done) {
      git.studentSourceLog({ kind: 'labs', proj: 'lab1', users: [ 'alice' ]}, [ '-1' ], function(err, lines) {
        lines.map(function(line) {
          return { rev: line.rev, msg: line.subject };
        }).should.eql([
          { rev: '236e692', msg: 'Less salutatory' },
        ]);
        done(err);
      });
    });
  });
  
  describe('cloneStudentSource', function() {
    it('should clone a student repo at HEAD', function(done) {
      git.cloneStudentSource({ kind: 'labs', proj: 'lab1', users: [ 'alice' ], rev: '236e692' }, fix.fixdir, function(err, line) {
        line.rev.should.equal('236e692');
        line.subject.should.equal('Less salutatory');
        fix.readFile('Main.java', function(fserr, data) {
          data.should.match(/Goodbye, world!/);
          done(err || fserr);
        })
      });
    });
    it('should clone a student repo at an old rev', function(done) {
      git.cloneStudentSource({ kind: 'labs', proj: 'lab1', users: [ 'alice' ], rev: 'cb138ec' }, fix.fixdir, function(err, line) {
        line.rev.should.equal('cb138ec');
        line.subject.should.equal('Initial version');
        fix.readFile('Main.java', function(fserr, data) {
          data.should.match(/Hello, world!/);
          done(err || fserr);
        })
      });
    })
  });
  
  describe('fetchBuilder', function() {
    it('should export staff build materials', function(done) {
      git.fetchBuilder({ kind: 'labs', proj: 'lab1' }, fix.fixdir, function(err, staffrev) {
        staffrev.should.equal('1178dcf');
        fix.readFile('grade.txt', function(fserr, data) {
          data.should.match(/rambling, incoherent/);
          done(err || fserr);
        });
      });
    });
  });
});
