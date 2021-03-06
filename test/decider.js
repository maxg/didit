const async = require('async');
const aws = require('aws-sdk');
const events = require('events');
const sinon = require('sinon');

const fixtures = require('./fixtures');
const mocks = require('./mocks');

describe('decider', function() {
  
  let decider = require('../src/decider');
  
  let sandbox = sinon.sandbox.create();
  let mock;
  
  beforeEach(function() {
    mock = mocks.AWSHTTP();
    sandbox.stub(aws.HttpClient, 'getInstance').returns(mock);
  });
  
  afterEach(function() {
    sandbox.restore();
  });
  
  describe('decide', function() {
    
    let task = 'no-such-task';
    let exec = {
      workflowId: 'no-such-workflow',
      runId: 'no-such-run'
    };
    
    function testDecide(history, eventCallback, decideCallback, doneCallback) {
      mock.events.once('request', request => request.success());
      async.parallel([
        function(next) {
          decider.once(exec.workflowId, function(event, data) {
            eventCallback(event, data);
            next();
          });
        },
        function(next) {
          decider.decide({
            taskToken: task, workflowExecution: exec,
            events: history
          }, function() {
            decideCallback(mock.requests[0].body.decisions);
            next();
          });
        }
      ], doneCallback);
    }
    
    it('activity completed should decide complete and emit done', function(done) {
      testDecide([
        { eventType: 'ActivityTaskCompleted', activityTaskCompletedEventAttributes: {
          result: JSON.stringify({ magic: true })
        } }
      ], function(event, data) {
        event.should.eql('done');
        data.should.eql({ magic: true });
      }, function(decisions) {
        decisions[0].decisionType.should.eql('CompleteWorkflowExecution');
      }, done);
    });
    it('activity timed out should decide fail and emit failed', function(done) {
      testDecide([
        { eventType: 'ActivityTaskTimedOut', activityTaskTimedOutEventAttributes: {
        } }
      ], function(event, data) {
        event.should.eql('failed');
      }, function(decisions) {
        decisions[0].decisionType.should.eql('FailWorkflowExecution');
      }, done);
    });
    it('schedule failed should decide fail and emit failed', function(done) {
      testDecide([
        { eventType: 'ScheduleActivityTaskFailed', scheduleActivityTaskFailedEventAttributes: {
        } }
      ], function(event, data) {
        event.should.eql('failed');
      }, function(decisions) {
        decisions[0].decisionType.should.eql('FailWorkflowExecution');
      }, done);
    });
    it('signaled should emit progress', function(done) {
      testDecide([
        { eventType: 'WorkflowExecutionSignaled', workflowExecutionSignaledEventAttributes: {
          signalName: 'progress',
          input: JSON.stringify({ forward: true })
        } }
      ], function(event, data) {
        event.should.eql('progress');
        data.should.eql({ forward: true });
      }, function(decisions) {
        decisions.should.eql([]);
      }, done);
    });
    it('started should decide schedule and emit start', function(done) {
      let input = JSON.stringify({ work: true });
      testDecide([
        { eventType: 'WorkflowExecutionStarted', workflowExecutionStartedEventAttributes: {
          input
        } }
      ], function(event, data) {
        event.should.eql('start');
        data.should.eql({ work: true });
      }, function(decisions) {
        decisions[0].decisionType.should.eql('ScheduleActivityTask');
        decisions[0].scheduleActivityTaskDecisionAttributes.input.should.eql(input);
      }, done);
    });
    it('failed should emit failed', function(done) {
      testDecide([
        { eventType: 'WorkflowExecutionFailed', workflowExecutionFailedEventAttributes: {
        } }
      ], function(event, data) {
        event.should.eql('failed');
      }, function(decisions) {
        decisions.should.eql([]);
      }, done);
    });
    it('timed out should emit failed', function(done) {
      testDecide([
        { eventType: 'WorkflowExecutionTimedOut', workflowExecutionTimedOutEventAttributes: {
        } }
      ], function(event, data) {
        event.should.eql('failed');
      }, function(decisions) {
        decisions.should.eql([]);
      }, done);
    });
    it('cancel should decide cancel and emit failed', function(done) {
      testDecide([
        { eventType: 'WorkflowExecutionCancelRequested', workflowExecutionCancelRequestedEventAttributes: {
        } }
      ], function(event, data) {
        event.should.eql('failed');
      }, function(decisions) {
        decisions[0].decisionType.should.eql('CancelWorkflowExecution');
      }, done);
    });
  });
  
  describe('createServer', function() {
    
    let swf = aws.SimpleWorkflow.prototype.getLatestServiceClass().prototype;
    
    it('should register types', function(done) {
      sandbox.stub(swf, 'registerWorkflowType').yields(null, {});
      sandbox.stub(swf, 'registerActivityType').yields(null, {});
      decider.createServer(function() {
        swf.registerWorkflowType.calledOnce.should.be.true();
        swf.registerActivityType.calledOnce.should.be.true();
        done();
      });
    });
    it('should poll for decision task', function(done) {
      sandbox.stub(swf, 'pollForDecisionTask');
      decider.createServer(function() {
        swf.pollForDecisionTask.calledOnce.should.be.true();
        done();
      });
    });
    it('should request statistics', function(done) {
      let statistics = {
        countOpenWorkflowExecutions: 4,
        countPendingDecisionTasks: 1,
        countPendingActivityTasks: 3,
        countClosedWorkflowExecutions: 7
      };
      for (let method in statistics) {
        sandbox.stub(swf, method).yields(null, { count: statistics[method] });
      }
      sandbox.useFakeTimers();
      decider.createServer(function() {
        sandbox.clock.tick(0);
        decider.stats().should.containEql({
          open: 4, decisions: 1, activities: 3,
          closed: 7, completed: 7, failed: 0
        });
        done();
      });
    });
  });
  
  describe('startWorkflow', function() {
    it('should start a build workflow', function(done) {
      let spec = { spec: true };
      async.parallel([
        function(next) {
          decider.startWorkflow('no-such-workflow', spec, next);
        },
        function(next) {
          mock.requests[0].body.input.should.eql(JSON.stringify(spec));
          mock.requests[0].success();
          next();
        }
      ], done);
    });
  });
});
