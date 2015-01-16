var async = require('async');
var fs = require('fs');
var moment = require('moment');
var should = require('should');
var sinon = require('sinon');

var fixtures = require('./fixtures');

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
  var sandbox = sinon.sandbox.create();
  
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
      async.parallel([
        function(next) {
          git.findStudentRepos({ users: [ 'a' ] }, function(err, repos) {
            repos.should.eql([]);
            next(err);
          });
        },
        function(next) {
          git.findStudentRepos({ kind: 'labs', users: [ 'bob' ]}, function(err, found) {
            found.should.eql([ repos[1] ]);
            next(err);
          });
        }
      ], done);
    });
    it('should fail with filesystem error', function(done) {
      sandbox.stub(fs, 'readdir').yields(new Error());
      sandbox.stub(console, 'error');
      git.findStudentRepos({ kind: 'labs' }, function(err, found) {
        should.exist(err);
        done();
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
    
    before(function(done) {
      fix.files(this.test, done);
    });
    
    it('should return current revision', function(done) {
      git.builderRev({ kind: 'labs', proj: 'lab2' }, function(err, staffrev) {
        staffrev.should.equal('df5a5e0');
        done(err);
      });
    });
    it('should return old revision', function(done) {
      git.builderRev({ kind: 'labs', proj: 'lab1' }, function(err, staffrev) {
        staffrev.should.equal('1178dcf');
        done(err);
      });
    });
  });
  
  describe('builderRevBefore', function() {
    
    before(function(done) {
      fix.files(this.test, done);
    });
    
    it('should return current revision', function(done) {
      git.builderRevBefore({ kind: 'labs', proj: 'lab2' }, 'df5a5e0', function(err, staffrev) {
        staffrev.should.equal('df5a5e0');
        done(err);
      });
    });
    it('should return most recent revision', function(done) {
      git.builderRevBefore({ kind: 'labs', proj: 'lab1' }, 'df5a5e0', function(err, staffrev) {
        staffrev.should.equal('1178dcf');
        done(err);
      });
    });
    it('should return old revision', function(done) {
      git.builderRevBefore({ kind: 'labs', proj: 'lab1' }, '1178dcf', function(err, staffrev) {
        staffrev.should.equal('1178dcf');
        done(err);
      });
    });
  });
  
  describe('fetchBuilder', function() {
    
    before(function(done) {
      fix.files(this.test, done);
    });
    
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
  
  describe('findReleasableProjects', function() {
    
    before(function(done) {
      fix.files(this.test, done);
    });
    
    it('should return releasable projects', function(done) {
      git.findReleasableProjects(function(err, specs) {
        specs.should.eql([ { kind: 'labs', proj: 'lab2' } ]);
        done(err);
      });
    });
  });
});
