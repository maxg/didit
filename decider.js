var async = require('async');
var aws = require('aws-sdk');
var events = require('events');
var os = require('os');

var config = require('./config');
var log = require('./logger').cat('decider');

var swf = new aws.SimpleWorkflow({ params: { domain: config.workflow.domain } });

function registerTypes() {
  swf.registerWorkflowType({
    name: config.swf.workflow.name,
    version: config.swf.workflow.version,
    defaultTaskList: config.swf.decisions,
    defaultExecutionStartToCloseTimeout: config.swf.default.execStartToClose,
    defaultTaskStartToCloseTimeout: config.swf.default.decisionStartToClose,
    defaultChildPolicy: config.swf.default.childPolicy
  }, function(err, data) {
    if (data) {
      log.info('registered build workflow', config.swf.workflow.version, data);
    } else if (err.code == 'TypeAlreadyExistsFault') {
      log.info('using build workflow', config.swf.workflow.version);
    } else {
      log.error(err, 'error registering build workflow');
    }
  });
  
  swf.registerActivityType({
    name: config.swf.activity.name,
    version: config.swf.activity.version,
    defaultTaskList: config.swf.activities,
    defaultTaskHeartbeatTimeout: config.swf.default.activityHeartbeat,
    defaultTaskScheduleToCloseTimeout: config.swf.default.activitySchedToClose,
    defaultTaskScheduleToStartTimeout: config.swf.default.activitySchedToStart,
    defaultTaskStartToCloseTimeout: config.swf.default.activityStartToClose
  }, function(err, data) {
    if (data) {
      log.info('registered build activity', config.swf.activity.version, data);
    } else if (err.code == 'TypeAlreadyExistsFault') {
      log.info('using build activity', config.swf.activity.version);
    } else {
      log.error(err, 'error registering build activity');
    }
  });
}

var emitter = new events.EventEmitter();

var deciders = {
  ActivityTaskCompleted: function(task, event) {
    log.info('ActivityTaskCompleted decider', event);
    var result = event.activityTaskCompletedEventAttributes.result;
    emitter.emit(task.workflowExecution.workflowId, 'done', JSON.parse(result));
    return [ {
      decisionType: 'CompleteWorkflowExecution',
      completeWorkflowExecutionDecisionAttributes: {
        result: 'Build complete'
      }
    } ];
  },
  ActivityTaskTimedOut: function(task, event) {
    log.warn('ActivityTaskTimedOut decider', event);
    emitter.emit(task.workflowExecution.workflowId, 'failed', { details: 'Task timed out' });
    return [ {
      decisionType: 'FailWorkflowExecution',
      failWorkflowExecutionDecisionAttributes: {
        reason: 'Task timed out'
      }
    } ];
  },
  ScheduleActivityTaskFailed: function(task, event) {
    log.warn('ScheduleActivityTaskFailed decider', event);
    emitter.emit(task.workflowExecution.workflowId, 'failed', { details: 'Schedule task failed' });
    return [ {
      decisionType: 'FailWorkflowExecution',
      failWorkflowExecutionDecisionAttributes: {
        reason: 'Failed to schedule ' + event.scheduleActivityTaskFailedEventAttributes.activityId
      }
    } ];
  },
  WorkflowExecutionSignaled: function(task, event) {
    log.info('WorkflowExecutionSignaled decider', event);
    var attr = event.workflowExecutionSignaledEventAttributes;
    if (attr.signalName == config.swf.signals.progress) {
      emitter.emit(task.workflowExecution.workflowId, 'progress', JSON.parse(attr.input));
    }
  },
  WorkflowExecutionStarted: function(task, event) {
    log.info('WorkflowExecutionStarted decider', event);
    var input = event.workflowExecutionStartedEventAttributes.input;
    emitter.emit(task.workflowExecution.workflowId, 'start', JSON.parse(input));
    return [ { decisionType: 'ScheduleActivityTask',
      scheduleActivityTaskDecisionAttributes: {
        activityId: [ task.workflowExecution.workflowId, 'all' ].join('-'),
        activityType: config.swf.activity,
        input: input
      }
    } ];
  },
  WorkflowExecutionFailed: function(task, event) {
    log.warn('WorkflowExecutionFailed decider', event);
    var attr = event.workflowExecutionFailedEventAttributes;
    emitter.emit(task.workflowExecution.workflowId, 'failed', { details: 'Workflow failed' });
  },
  WorkflowExecutionTimedOut: function(task, event) {
    log.warn('WorkflowExecutionTimedOut decider', event);
    emitter.emit(task.workflowExecution.workflowId, 'failed', { details: 'Workflow timed out' });
  },
  WorkflowExecutionCancelRequested: function(task, event) {
    log.warn('WorkflowExecutionCancelRequested decider', event);
    emitter.emit(task.workflowExecution.workflowId, 'failed', { details: 'Workflow canceled' });
    return [ { decisionType: 'CancelWorkflowExecution' } ];
  }
};

exports.decide = function(decisionTask, next) {
  if ( ! decisionTask.taskToken) {
    next();
    return;
  }
  
  log.info('decide', decisionTask.workflowExecution);
  for (var ii = 0; ii < decisionTask.events.length; ii++) {
    var event = decisionTask.events[ii];
    if (deciders[event.eventType]) {
      var decisions = deciders[event.eventType](decisionTask, event);
      log.info('decisions', decisions);
      swf.respondDecisionTaskCompleted({
        taskToken: decisionTask.taskToken,
        decisions: decisions || []
      }, function(err, data) {
        if (err) {
          log.error(err, 'error deciding');
        }
        next();
      });
      return;
    }
  }
  log.info('no decisions');
  next();
}

module.closed = false;
module.statistics = {};
exports.stats = function() {
  return module.statistics;
};

// start handling decision tasks
exports.createServer = function(callback) {
  registerTypes();
  
  function pollForDecisionTasks() {
    if (module.closed) {
      log.info('closing server');
      emitter.emit('close');
      return;
    }
    log.info('polling');
    swf.pollForDecisionTask({
      taskList: config.swf.decisions,
      identity: [ 'decider', os.hostname(), process.pid ].join('-'),
      reverseOrder: true
    }, function(err, data) {
      if (err) {
        log.error(err, 'error polling for decision');
        setTimeout(pollForDecisionTasks, 1000 * 60 * 4);
      } else {
        exports.decide(data, pollForDecisionTasks);
      }
    });
  }
  pollForDecisionTasks();
  
  function updateStats() {
    var interval = {
      oldestDate: Math.floor(+new Date()/1000) - (60 * 30),
      latestDate: Math.ceil(new Date()/1000)
    };
    async.auto({
      open: function(next) {
        swf.countOpenWorkflowExecutions({
          startTimeFilter: { oldestDate: 0 }
        }, function(err, data) {
          next(err, data ? data.count : null);
        });
      },
      closed: function(next) {
        swf.countClosedWorkflowExecutions({
          closeTimeFilter: interval
        }, function(err, data) {
          next(err, data ? data.count : null);
        });
      },
      completed: function(next) {
        swf.countClosedWorkflowExecutions({
          closeTimeFilter: interval,
          closeStatusFilter: { status: 'COMPLETED' }
        }, function(err, data) {
          next(err, data ? data.count : null);
        });
      }
    }, function(err, results) {
      if (err) {
        log.error(err, 'error checking stats');
        return;
      }
      results.failed = results.closed - results.completed;
      if (results.failed > (module.statistics.failed || 0)) {
        log.error(results, 'new workflow failures');
      }
      results.interval = interval;
      module.statistics = results;
    });
  }
  setInterval(updateStats, 1000 * 120);
  updateStats();
  
  callback();
};

// stop handling decision tasks
exports.close = function(callback) {
  log.info('will close');
  module.closed = true;
  emitter.once('close', callback);
};

// start the workflow for a build
exports.startWorkflow = function(id, spec, callback) {
  log.info({ spec: spec }, 'startWorkflow', id);
  swf.startWorkflowExecution({
    workflowId: id,
    workflowType: config.swf.workflow,
    input: JSON.stringify(spec)
  }, function(err, data) {
    if (err) {
      log.error(err, 'startWorkflowExecution error');
      err.dmesg = 'failed to start workflow execution';
    }
    callback(err);
  });
};

// add a listener for events by build id
exports.on = function(id, callback) {
  emitter.on(id, callback);
};

exports.once = function(id, callback) {
  emitter.once(id, callback);
};

exports.removeListener = function(id, callback) {
  emitter.removeListener(id, callback);
};
