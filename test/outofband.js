var fs = require('fs');
var moment = require('moment');
var sinon = require('sinon');

describe('outofband', function() {
  
  var config = require('../config');
  var builder = require('../builder');
  var git = require('../git');
  var mailer = require('../mailer');
  var outofband = require('../outofband');
  
  var sandbox = sinon.sandbox.create();
  
  var spec = { kind: 'projects', proj: 'helloworld', users: [ 'alice', 'bob' ], rev: 'abc1234' };
  
  afterEach(function() {
    sandbox.restore();
  });
  
  describe('notifyBuild', function() {
    
    beforeEach(function() {
      // will need to emit 'done' event for notifyBuild to process build
      sandbox.spy(builder, 'monitor');
      // notifyBuild will request the build...
      sandbox.stub(builder, 'findBuild').yields();
      // ... and the changelog
      sandbox.stub(git, 'studentSourceLog').yields();
    });
    
    it('should email a single-rev changelog', function(done) {
      outofband.notifyBuild(spec, 'fake', [], { /* oldrev undefined */ });
      sandbox.stub(mailer, 'sendMail', function() {
        git.studentSourceLog.firstCall.args[1].should.eql([ '-1', 'abc1234' ]);
        done();
      });
      builder.monitor.firstCall.returnValue.emit('done');
    });
    
    it('should email an initial-rev changelog', function(done) {
      outofband.notifyBuild(spec, 'fake', [], { oldrev: '0000000' });
      sandbox.stub(mailer, 'sendMail', function() {
        git.studentSourceLog.firstCall.args[1].should.eql([ 'abc1234' ]);
        done();
      });
      builder.monitor.firstCall.returnValue.emit('done');
    });
    
    it('should email a multi-rev changelog', function(done) {
      outofband.notifyBuild(spec, 'fake', [], { oldrev: 'abc0000' });
      sandbox.stub(mailer, 'sendMail', function() {
        git.studentSourceLog.firstCall.args[1].should.eql([ 'abc0000..abc1234' ]);
        done();
      });
      builder.monitor.firstCall.returnValue.emit('done');
    });
    
    it('should email about a slow build', function(done) {
      sandbox.useFakeTimers('setTimeout');
      outofband.notifyBuild(spec, 'fake', [], {});
      sandbox.stub(mailer, 'sendMail', function() {
        builder.findBuild.calledOnce.should.be.true;
        done();
      });
      sandbox.clock.tick(1000 * 60);
      builder.findBuild.called.should.be.false;
      sandbox.clock.tick(1000 * 60 * 60);
    });
  });
  
  describe('log', function() {
    
    before(function() {
      config.log.mail = [ 'somebody' ];
    });
    
    after(function() {
      config.log.mail = undefined;
    });
    
    describe('notifyGradeFromBuilds', function() {
      it('should describe grading', function(done) {
        outofband.notifyGradeFromBuilds({}, [
          { users: [ 'alice', 'bob' ] }, { users: [ 'yolanda' ] }
        ], 'eve', function(err, result) {
          mailer.pickup(result, function(pickuperr, email) {
            email.should.match(/2 grades assigned/).and.match(/by revision/);
            email.should.match(/alice-bob\b/).and.match(/yolanda\b/);
            done(err || pickuperr);
          });
        });
      });
    });
    
    describe('notifyGradeFromSweep', function() {
      it('should describe grading', function(done) {
        outofband.notifyGradeFromSweep({ datetime: moment() }, [
          { users: [ 'alice', 'bob' ] }, { users: [ 'zach' ] }
        ], 'eve', function(err, result) {
          mailer.pickup(result, function(pickuperr, email) {
            email.should.match(/2 grades assigned/).and.match(/from sweep/);
            email.should.match(/alice-bob\b/).and.match(/zach\b/);
            done(err || pickuperr);
          });
        });
      });
    });
    
    describe('notifyMilestoneRelease', function() {
      it('should describe milestone', function(done) {
        outofband.notifyMilestoneRelease({
          kind: 'psets', proj: 'ps0', name: 'alpha'
        }, 'eve', function(err, result) {
          mailer.pickup(result, function(pickuperr, email) {
            email.should.match(/psets\/ps0.*alpha.*grades released/);
            email.should.match(/by.*eve/);
            done(err || pickuperr);
          });
        });
      });
    });
    
    describe('notifySweepStart', function() {
      it('should describe sweep', function(done) {
        outofband.notifySweepStart({
          kind: 'psets', proj: 'ps1'
        }, moment(), 'eve', function(err, result) {
          mailer.pickup(result, function(pickuperr, email) {
            email.should.match(/psets\/ps1/).and.match(/started sweeping/i);
            email.should.match(/by.*eve/);
            done(err || pickuperr);
          });
        });
      });
    });
    
    describe('notifySweepComplete', function() {
      it('should describe sweep', function(done) {
        outofband.notifySweepComplete({
          kind: 'psets', proj: 'ps2'
        }, moment(), 'eve', function(err, result) {
          mailer.pickup(result, function(pickuperr, email) {
            email.should.match(/psets\/ps2/).and.match(/finished sweeping/i);
            email.should.match(/by.*eve/);
            done(err || pickuperr);
          });
        });
      });
    });
    
    describe('notifySweepRebuildStart', function() {
      it('should describe sweep', function(done) {
        outofband.notifySweepRebuildStart({
          kind: 'psets', proj: 'ps3'
        }, moment(), 'eve', function(err, result) {
          mailer.pickup(result, function(pickuperr, email) {
            email.should.match(/psets\/ps3/).and.match(/started rebuilding sweep/i);
            email.should.match(/by.*eve/);
            done(err || pickuperr);
          });
        });
      });
    });
    
    describe('notifySweepRebuildComplete', function() {
      it('should describe sweep', function(done) {
        outofband.notifySweepRebuildComplete({
          kind: 'psets', proj: 'ps4'
        }, moment(), 'eve', function(err, result) {
          mailer.pickup(result, function(pickuperr, email) {
            email.should.match(/psets\/ps4/).and.match(/finished rebuilding sweep/i);
            email.should.match(/by.*eve/);
            done(err || pickuperr);
          });
        });
      });
    });
  });
});
