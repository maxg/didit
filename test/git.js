var fixtures = require('./fixtures');
var moment = require('moment');
var should = require('should');

describe('git', function() {
  
  var git = require('../git');
  
  var fix = fixtures();
  var repos = [
    { kind: 'labs', proj: 'lab1', users: [ 'alice' ] },
    { kind: 'labs', proj: 'lab1', users: [ 'bob' ] },
    { kind: 'labs', proj: 'lab2', users: [ 'alice' ] },
    { kind: 'projects', proj: 'helloworld', users: [ 'alice', 'bob' ] }
  ];
  var repo = repos[0];
  
  before(function(done) {
    fix.files(this.test, done);
  });
  
  beforeEach(function(done) {
    fix.files(this.currentTest, done);
  });
  
  afterEach(function() {
    fix.forget();
  });
  
  after(function(done) {
    fix.remove(done);
  });
  
  describe('findStudentRepos', function() {
    it('should return repo specifications', function(done) {
      git.findStudentRepos({}, function(err, found) {
        found.should.eql(repos);
        done(err);
      });
    });
    it('kind restriction should limit repos', function(done) {
      git.findStudentRepos({ kind: 'labs' }, function(err, found) {
        found.should.eql(repos.slice(0, 3));
        done(err);
      });
    });
    it('proj restriction should limit repos', function(done) {
      git.findStudentRepos({ proj: 'helloworld' }, function(err, found) {
        found.should.eql([ repos[3] ]);
        done(err);
      });
    });
    it('user restriction should limit repos', function(done) {
      git.findStudentRepos({ kind: 'labs', users: [ 'bob' ]}, function(err, found) {
        found.should.eql([ repos[1] ]);
        done(err);
      });
    });
  });
  
  describe('studentSourceRev', function() {
    it('should return current revision', function(done) {
      git.studentSourceRev(repo, function(err, rev) {
        rev.should.equal('236e692');
        done(err);
      });
    });
  });
  
  describe('studentSourceRevAt', function() {
    it('should return current revision', function(done) {
      git.studentSourceRevAt(repo, moment(), function(err, rev) {
        rev.should.equal('236e692');
        done(err);
      });
    });
    it('should return past revision', function(done) {
      git.studentSourceRevAt(repo, moment('2013-08-09T20:09:30 Z'), function(err, rev) {
        rev.should.equal('cb138ec');
        done(err);
      });
    });
    it('should fail for prehistoric time', function(done) {
      git.studentSourceRevAt(repo, moment('2013-08-09T10:00:00 Z'), function(err, rev) {
        should.exist(err);
        should.not.exist(rev);
        done();
      });
    });
  });
  
  describe('studentSourceLog', function() {
    it('should return a full commit log', function(done) {
      git.studentSourceLog(repo, [], function(err, lines) {
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
      git.studentSourceLog(repo, [ '-1' ], function(err, lines) {
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
  
  describe('builderRev', function() {
    it('should return current revision', function(done) {
      git.builderRev(function(err, staffrev) {
        staffrev.should.equal('1178dcf');
        done(err);
      });
    });
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