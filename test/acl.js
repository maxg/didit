var async = require('async');
var events = require('events');
var should = require('should');
var sinon = require('sinon');

describe('acl', function() {
  
  var config = require('../config');
  var acl = require('../acl');
  var util = require('../util');
  
  var sandbox = sinon.sandbox.create();
  
  beforeEach(function() {
    // spawnAndLog returns a child that exits once any listener is attached
    sandbox.childExitCode = 0;
    sandbox.stub(util, 'spawnAndLog', function() {
      var child = new events.EventEmitter().on('newListener', function() {
        if (child.exited) { return; }
        process.nextTick(function() { child.emit('exit', sandbox.childExitCode); });
        child.exited = true;
      });
      return child;
    });
  });
  
  afterEach(function() {
    sandbox.restore();
  });
  
  describe('set', function() {
    
    describe('none', function() {
      
      beforeEach(function() {
        sandbox.stub(config.student, 'acl', 'none');
      });
      
      it('should succeed', function(done) {
        acl.set('/fake/directory', 'fakeuser', acl.level.none, done);
      });
    });
    
    describe('afs', function() {
      
      var users = { other: 'system:anyuser' };
      var levels = { none: 'none', read: 'read', write: 'write' };
      
      beforeEach(function() {
        sandbox.stub(config.student, 'acl', 'afs');
      });
      
      it('should execute recursive fs setacl', function(done) {
        acl.set('/fake/directory', 'fakeuser', acl.level.none, function(err) {
          util.spawnAndLog.calledOnce.should.be.true;
          var args = util.spawnAndLog.lastCall.args;
          args[0].should.eql('find');
          args[1].should.eql([
            '.', '-type', 'd', '-exec', 'fs', 'setacl', '-acl', 'fakeuser', 'none', '-dir', '{}', '+'
          ]);
          args[2].should.include({ cwd: '/fake/directory' });
          done(err);
        });
      });
      it('should translate special users', function(done) {
        async.eachSeries(Object.keys(users), function(user, next) {
          acl.set('/fake/directory', acl.user[user], acl.level.none, function(err) {
            var findArgs = util.spawnAndLog.lastCall.args[1];
            findArgs.slice(findArgs.indexOf('-acl')).slice(1, 3).should.eql([ users[user], 'none' ]);
            done(err);
          });
        }, done);
      });
      it('should translate permission levels', function(done) {
        async.eachSeries(Object.keys(levels), function(level, next) {
          acl.set('/fake/directory', 'fakeuser', acl.level[level], function(err) {
            var findArgs = util.spawnAndLog.lastCall.args[1];
            findArgs.slice(findArgs.indexOf('-acl')).slice(1, 3).should.eql([ 'fakeuser', levels[level] ]);
            next(err);
          });
        }, done);
      });
      it('should fail with invalid permission level', function(done) {
        acl.set('/fake/directory', 'fakeuser', 'none', function(err) {
          should.exist(err);
          util.spawnAndLog.called.should.be.false;
          done();
        });
      });
      it('should fail with child error', function(done) {
        sandbox.childExitCode = null;
        acl.set('/fake/directory', 'fakeuser', acl.level.none, function(err) {
          should.exist(err);
          done();
        });
      });
      it('should fail with child failure', function(done) {
        sandbox.childExitCode = 1;
        acl.set('/fake/directory', 'fakeuser', acl.level.none, function(err) {
          should.exist(err);
          done();
        });
      });
    });
  });
});
