var sinon = require('sinon');

describe('outofband', function() {
  
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
});
