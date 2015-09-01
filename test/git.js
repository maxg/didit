var byline = require('byline');
var mkdirp = require('mkdirp');
var path = require('path');
var rimraf = require('rimraf');
var spawn = require('child_process').spawn;
  var config = require('../config');
  var acl = require('../acl');
    
    before(function(done) {
      fix.files(this.test, done);
    });
    
    
    before(function(done) {
      fix.files(this.test, done);
    });
    
    
    before(function(done) {
      fix.files(this.test, done);
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
        starting.should.be.true;
        done(err);
      });
    });
    it('should return false for project without starting repo', function(done) {
      git.hasStartingRepo({ kind: 'labs', proj: 'lab2' }, function(err, starting) {
        starting.should.be.false;
        done(err);
      });
    });
  });
  
  describe('createStartingRepo', function() {
    
    var specs = {
      startable: { kind: 'labs', proj: 'lab3' },
      missing: { kind: 'labs', proj: 'lab1' }
    };
    var resultdirs = {};
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
      }), rimraf, done);
    });
    
    it('should create a starting repo', function(done) {
      fs.existsSync(resultdirs.startable).should.be.false;
      git.createStartingRepo(specs.startable, 'nobody', function(err) {
        fs.existsSync(resultdirs.startable).should.be.true;
        done(err);
      });
    });
    it('should create a starting commit', function(done) {
      git.createStartingRepo(specs.startable, 'nobody', function(err) {
        var log = byline(spawn('git', [ 'log', '--all', '--patch' ], {
          cwd: resultdirs.startable,
          stdio: 'pipe'
        }).stdout, { encoding: 'utf8' });
        var expected = [
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
          var expect = expected.shift();
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
      mkdirp(resultdirs.startable, function(fserr) {
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
        fs.existsSync(resultdirs.missing).should.be.false;
        done();
      });
    });
  });
  
  describe('createStudentRepo', function() {
    
    var specs = {
      startable: { kind: 'labs', proj: 'lab4', users: [ 'eve' ] },
      missing: { kind: 'labs', proj: 'lab1', users: [ 'eve' ] }
    };
    var resultdirs = {};
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
      }), rimraf, done);
    });
    
    it('should create a student repo', function(done) {
      fs.existsSync(resultdirs.startable).should.be.false;
      git.createStudentRepo(specs.startable, 'nobody', function(err) {
        var head = fs.readFileSync(path.join(resultdirs.startable, 'HEAD'), { encoding: 'utf8' });
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
      mkdirp(resultdirs.startable, function(fserr) {
        git.createStudentRepo(specs.startable, 'nobody', function(err) {
          should.exist(err);
          fs.readdirSync(resultdirs.startable).should.eql([]);
          done(fserr);
        });
      })
    });
    it('should fail with missing starting repo', function(done) {
      git.createStudentRepo(specs.missing, 'nobody', function(err) {
        should.exist(err);
        fs.existsSync(resultdirs.missing).should.be.false;
        done();
      });
    });
  });