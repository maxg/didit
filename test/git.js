const async = require('async');
const byline = require('byline');
const fs = require('fs');
const fsextra = require('fs-extra');
const moment = require('moment');
const path = require('path');
const should = require('should');
const sinon = require('sinon');
const spawn = require('child_process').spawn;

const fixtures = require('./fixtures');

describe('git', function() {
  
  let config = require('../src/config');
  let acl = require('../src/acl');
  let git = require('../src/git');
  
  let fix = fixtures();
  let repos = [
    { kind: 'labs', proj: 'lab1', users: [ 'alice' ] },
    { kind: 'labs', proj: 'lab1', users: [ 'bob' ] },
    { kind: 'labs', proj: 'lab2', users: [ 'alice' ] },
    { kind: 'projects', proj: 'helloworld', users: [ 'alice', 'bob' ] }
  ];
  let repo = repos[0];
  let sandbox = sinon.sandbox.create();
  
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
      let stub = sandbox.stub(fs, 'readdir').yields(new Error());
      sandbox.stub(console, 'error');
      git.findStudentRepos({ kind: 'labs' }, function(err, found) {
        stub.called.should.be.true();
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
  
  describe('hasStartingRepo', function() {
    
    before(function(done) {
      fix.files(this.test, done);
    });
    
    it('should return true for project with starting repo', function(done) {
      git.hasStartingRepo({ kind: 'labs', proj: 'lab4' }, function(err, starting) {
        starting.should.be.true();
        done(err);
      });
    });
    it('should return false for project without starting repo', function(done) {
      git.hasStartingRepo({ kind: 'labs', proj: 'lab2' }, function(err, starting) {
        starting.should.be.false();
        done(err);
      });
    });
  });
  
  describe('createStartingRepo', function() {
    
    let specs = {
      startable: { kind: 'labs', proj: 'lab3' },
      missing: { kind: 'labs', proj: 'lab1' }
    };
    let resultdirs = {};
    Object.keys(specs).forEach(function(key) {
      resultdirs[key] = path.join(
        config.student.repos, config.student.semester,
        specs[key].kind, specs[key].proj, 'didit', 'starting.git'
      );
    });
    
    before(function(done) {
      fix.files(this.test, done);
    });
    
    afterEach(function(done) {
      async.each(Object.keys(resultdirs).map(function(key) {
        return resultdirs[key];
      }), fsextra.remove, done);
    });
    
    it('should create a starting repo', function(done) {
      fs.existsSync(resultdirs.startable).should.be.false();
      git.createStartingRepo(specs.startable, 'nobody', function(err) {
        fs.existsSync(resultdirs.startable).should.be.true();
        done(err);
      });
    });
    it('should create a starting commit', function(done) {
      git.createStartingRepo(specs.startable, 'nobody', function(err) {
        let log = byline(spawn('git', [ 'log', '--all', '--patch' ], {
          cwd: resultdirs.startable,
          stdio: 'pipe'
        }).stdout, { encoding: 'utf8' });
        let expected = [
          /commit/,
          'Author: nobody via Didit <nobody@example.com>',
          /Date:/,
          /Starting code for labs\/lab3/,
          /start\.txt/,
          'new file mode 100644',
          'index 0000000..8a3b877',
          '--- /dev/null',
          '+++ b/start.txt',
          /@@/,
          '+1. Write the spec',
          '+2. Write tests',
          '+3. Implement',
        ];
        log.on('data', function(line) {
          let expect = expected.shift();
          if (expect instanceof RegExp) {
            line.should.match(expect);
          } else {
            line.should.equal(expect);
          }
        });
        log.on('end', function() {
          expected.should.eql([]);
          done(err);
        });
      });
    });
    it('should omit repo hooks', function(done) {
      git.createStartingRepo(specs.startable, 'nobody', function(err) {
        fs.readdirSync(path.join(resultdirs.startable, 'hooks')).should.eql([]);
        done(err);
      });
    });
    it('should set filesystem permissions', function(done) {
      git.createStartingRepo(specs.startable, 'nobody', function(err) {
        acl.set.calls.slice(-1).should.eql([
          { dir: resultdirs.startable, user: acl.user.other, perm: acl.level.read }
        ]);
        done(err);
      });
    });
    it('should fail with existing starting repo', function(done) {
      fsextra.mkdirs(resultdirs.startable, function(fserr) {
        git.createStartingRepo(specs.startable, 'nobody', function(err) {
          should.exist(err);
          fs.readdirSync(resultdirs.startable).should.eql([]);
          done(fserr);
        })
      });
    });
    it('should fail with missing starting materials', function(done) {
      git.createStartingRepo(specs.missing, 'nobody', function(err) {
        should.exist(err);
        fs.existsSync(resultdirs.missing).should.be.false();
        done();
      });
    });
  });
  
  describe('createStudentRepo', function() {
    
    let specs = {
      startable: { kind: 'labs', proj: 'lab4', users: [ 'eve' ] },
      missing: { kind: 'labs', proj: 'lab1', users: [ 'eve' ] }
    };
    let resultdirs = {};
    Object.keys(specs).forEach(function(key) {
      resultdirs[key] = path.join(
        config.student.repos, config.student.semester,
        specs[key].kind, specs[key].proj, specs[key].users.join('-')+'.git'
      );
    });
    
    before(function(done) {
      fix.files(this.test, done);
    });
    
    afterEach(function(done) {
      async.each(Object.keys(resultdirs).map(function(key) {
        return resultdirs[key];
      }), fsextra.remove, done);
    });
    
    it('should create a student repo', function(done) {
      fs.existsSync(resultdirs.startable).should.be.false();
      git.createStudentRepo(specs.startable, 'nobody', function(err) {
        let head = fs.readFileSync(path.join(resultdirs.startable, 'HEAD'), { encoding: 'utf8' });
        head.should.eql('not: a/valid/head\n');
        done(err);
      });
    });
    it('should include repo hooks', function(done) {
      git.createStudentRepo(specs.startable, 'nobody', function(err) {
        fs.readdirSync(path.join(resultdirs.startable, 'hooks')).should.eql([ 'post-receive' ]);
        done(err);
      });
    });
    it('should set filesystem permissions', function(done) {
      git.createStudentRepo(specs.startable, 'nobody', function(err) {
        acl.set.calls.slice(-2).should.eql([
          { dir: resultdirs.startable, user: acl.user.other, perm: acl.level.none },
          { dir: resultdirs.startable, user: 'eve', perm: acl.level.write }
        ]);
        done(err);
      });
    });
    it('should fail with existing student repo', function(done) {
      fsextra.mkdirs(path.join(resultdirs.startable, 'objects'), function(fserr) {
        git.createStudentRepo(specs.startable, 'nobody', function(err) {
          should.exist(err);
          fs.readdirSync(resultdirs.startable).should.eql([ 'objects' ]);
          done(fserr);
        });
      });
    });
    it('should fail with missing starting repo', function(done) {
      git.createStudentRepo(specs.missing, 'nobody', function(err) {
        should.exist(err);
        fs.existsSync(resultdirs.missing).should.be.false();
        done();
      });
    });
    it('should fail with filesystem error', function(done) {
      let gracefulfs = require('graceful-fs'); // createStudentRepo -> fs-extra -> graceful-fs
      let spy = sandbox.spy(gracefulfs, 'mkdir').withArgs(resultdirs.startable);
      let stub = sandbox.stub(gracefulfs, 'readdir').yields(new Error());
      git.createStudentRepo(specs.startable, 'nobody', function(err) {
        stub.called.should.be.true();
        should.exist(err);
        spy.calledOnce.should.be.true();
        fs.existsSync(resultdirs.startable).should.be.false();
        done();
      });
    });
  });
});
