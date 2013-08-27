var async = require('async');
var fs = require('fs');
var path = require('path');
var should = require('should');
var sinon = require('sinon');

var fixtures = require('./fixtures');

describe('builder', function() {
  
  var config = require('../config');
  var builder = require('../builder');
  
  var fix = fixtures();
  var fixed = {
    repo: {
      proj: [
        { kind: 'projects', proj: 'helloworld', users: [ 'glittle', 'kp' ] },
        { kind: 'projects', proj: 'helloworld', users: [ 'maxg', 'rcm' ] },
      ],
      lab: [
        { kind: 'labs', proj: 'lab1', users: [ 'glittle' ] },
        { kind: 'labs', proj: 'lab1', users: [ 'maxg' ] },
        { kind: 'labs', proj: 'lab2', users: [ 'glittle' ] },
        { kind: 'labs', proj: 'lab2', users: [ 'maxg' ] },
      ]
    },
    rev: {
      lab: [
        { kind: 'labs', proj: 'lab1', users: [ 'maxg' ], rev: 'aaaa123' },
        { kind: 'labs', proj: 'lab1', users: [ 'maxg' ], rev: 'bbbb123' },
        { kind: 'labs', proj: 'lab1', users: [ 'glittle' ], rev: 'cccc123' },
      ]
    }
  };
  
  before(function(done) {
    fix.files(this.test, done);
  });
  
  describe('findProjectsSync', function() {
    it('should return project specifications', function() {
      var specs = builder.findProjectsSync();
      specs.should.eql([
        { kind: 'labs', proj: 'lab1' },
        { kind: 'labs', proj: 'lab2' },
        { kind: 'projects', proj: 'helloworld' }
      ]);
    });
  });
  
  describe('findRepos', function() {
    it('kind restriction should limit repos', function(done) {
      builder.findRepos({ kind: 'projects' }, function(err, repos) {
        repos.should.eql(fixed.repo.proj);
        done(err);
      });
    });
    it('proj restriction should limit repos', function(done) {
      builder.findRepos({ proj: 'lab1' }, function(err, repos) {
        repos.should.eql(fixed.repo.lab.slice(0, 2));
        done(err);
      });
    });
    it('user restriction should limit repos', function(done) {
      async.parallel([
        function(next) {
          builder.findRepos({ users: [ 'maxg' ] }, function(err, repos) {
            repos.should.eql([ fixed.repo.lab[1], fixed.repo.lab[3], fixed.repo.proj[1] ]);
            next(err);
          });
        },
        function(next) {
          builder.findRepos({ users: [ 'maxg', 'rcm' ] }, function(err, repos) {
            repos.should.eql([ fixed.repo.proj[1] ]);
            next(err);
          });
        }
      ], done);
    });
  });
  
  describe('findBuild', function() {
    
    beforeEach(function(done) {
      fix.files(this.currentTest, done);
    });
    
    it('should return build result', function(done) {
      builder.findBuild(fixed.rev.lab[0], function(err, result) {
        result.spec.should.eql(fixed.rev.lab[0]);
        result.favoriteColor.should.eql([ 255, 0, 0 ]);
        result.txt.output.should.equal('Output text\n');
        result.json.output.should.eql({ answer: 42 });
        done(err);
      });
    });
    it('should fail with no build', function(done) {
      builder.findBuild({ kind: 'labs', proj: 'lab1', users: [ 'glittle' ], rev: 'aaaa123' }, function(err, result) {
        err.should.be.an.instanceof(Error);
        should.not.exist(result);
        done();
      });
    });
    it('should fail with invalid result JSON', function(done) {
      builder.findBuild(fixed.rev.lab[0], function(err, result) {
        err.should.be.an.instanceof(SyntaxError);
        should.not.exist(result);
        done();
      })
    });
    it('should fail with invalid output JSON', function(done) {
      builder.findBuild(fixed.rev.lab[0], function(err, result) {
        err.should.be.an.instanceof(SyntaxError);
        result.spec.should.eql(fixed.rev.lab[0]);
        result.favoriteColor.should.eql([ 255, 0, 0 ]);
        done();
      })
    });
  });
  
  describe('startBuild', function() {
    
    var decider = require('../decider');
    
    beforeEach(function() {
      sinon.stub(decider, 'startWorkflow');
    });
    
    afterEach(function() {
      decider.startWorkflow.restore();
    });
    
    it('should start a build workflow', function(done) {
      decider.startWorkflow.callsArg(2);
      var spec = fixed.rev.lab[0];
      builder.startBuild(spec, function(err, id) {
        id.should.equal([ 'build', config.student.semester, spec.kind, spec.proj, spec.users[0], spec.rev ].join('-'));
        decider.startWorkflow.calledWith(id, spec).should.be.true;
        done(err);
      });
    });
    it('should fail with no repository', function(done) {
      builder.startBuild(fixed.rev.lab[2], function(err, id) {
        err.should.exist;
        decider.startWorkflow.called.should.be.false;
        done(id);
      });
    });
  })
  
  describe('build', function() {
    
    var ant = require('../ant');
    var git = require('../git');
    
    var spec = fixed.rev.lab[0];
    var resultdir = path.join(
      config.build.results, config.student.semester,
      spec.kind, spec.proj, spec.users[0], spec.rev
    );
    
    beforeEach(function() {
      var test = this.currentTest;
      sinon.stub(git, 'cloneStudentSource', function(spec, dest, callback) {
        fix.filesTo(test, 'build', dest, function() {
          callback(null, { rev: spec.rev });
        });
      });
      sinon.stub(git, 'fetchBuilder').yields(null, 'f0f0f0f');
    });
    
    afterEach(function() {
      git.cloneStudentSource.restore();
      git.fetchBuilder.restore();
    });
    
    it('should report when source is cloned', function(done) {
      builder.build(spec, function(message) {
        message.should.equal('Checked out rev aaaa123');
      }, function(err) {
        done(err);
      });
    });
    it('should report when compilation fails', function(done) {
      var spy = sinon.spy();
      builder.build(spec, spy, function(err) {
        spy.withArgs('Compilation error').calledOnce.should.be.true;
        done(err);
      });
    });
    it('should return build results', function(done) {
      var start = +new Date();
      builder.build(spec, function() { }, function(err, results) {
        var finish = +new Date();
        results.source.rev.should.equal('aaaa123');
        results.builder.should.equal('f0f0f0f');
        results.compile.should.be.a('boolean');
        results.public.should.be.a('boolean');
        results.hidden.should.be.a('boolean');
        results.grade.should.be.an.instanceof(Array);
        results.started.should.be.within(start, finish);
        results.finished.should.be.within(start, finish);
        done(err);
      });
    });
    it('should record build results', function(done) {
      builder.build(spec, function() { }, function(err, results) {
        results.compile.should.be.true;
        fs.readFile(path.join(resultdir, 'result.json'), { encoding: 'utf8' }, function(fserr, data) {
          delete results.builderProgress;
          delete results.compileProgress;
          JSON.parse(data).should.eql(results);
          done(err || fserr);
        });
      });
    });
    it('should run public tests', function(done) {
      builder.build(spec, function() { }, function(err, results) {
        results.public.should.be.true;
        fs.readFile(path.join(resultdir, results.builder, 'public.json'), { encoding: 'utf8' }, function(fserr, data) {
          JSON.parse(data).testsuites[0].testcases[0].name.should.eql('totallyFake');
          done(err || fserr);
        });
      });
    });
    it('should run hidden tests', function(done) {
      builder.build(spec, function() { }, function(err, results) {
        results.hidden.should.be.true;
        fs.readFile(path.join(resultdir, results.builder, 'hidden.json'), { encoding: 'utf8' }, function(fserr, data) {
          JSON.parse(data).testsuites[0].testcases[0].name.should.eql('entirelyFake');
          done(err || fserr);
        });
      })
    });
    it('should grade test results', function(done) {
      builder.build(spec, function() { }, function(err, results) {
        results.grade.should.eql([ 5, 15 ]);
        fs.readFile(path.join(resultdir, results.builder, 'grade.json'), { encoding: 'utf8' }, function(fserr, data) {
          var json = JSON.parse(data);
          json.testsuites[0].name.should.eql('FakePublic');
          json.testsuites[0].testcases.map(function(test) {
            return test.name;
          }).should.eql([ 'publicPass', 'publicFail' ]);
          json.testsuites[1].name.should.eql('FakeHidden');
          json.testsuites[1].testcases.map(function(test) {
            return test.name;
          }).should.eql([ 'hiddenPass', 'hiddenError' ]);
          done(err || fserr);
        });
      });
    });
  });
});
