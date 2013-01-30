var async = require('async');
var aws = require('aws-sdk');
var events = require('events');
var os = require('os');

var config = require('./config');
var log = require('./logger').cat('decider');

aws.config.loadFromPath('./config/aws.json');

var swf = new aws.SimpleWorkflow();

swf.client.registerWorkflowType({
  domain: config.workflow.domain,
  name: config.swf.workflow.name,
  version: config.swf.workflow.version,
  defaultTaskList: config.swf.decisions,
  defaultExecutionStartToCloseTimeout: config.swf.default.execStartToClose,
  defaultTaskStartToCloseTimeout: config.swf.default.decisionStartToClose,
  defaultChildPolicy: config.swf.default.childPolicy
}, function(err, data) {
  if (data) {
    log.info('registered build workflow', config.swf.workflow.version, data)
  } else if (err.code == 'TypeAlreadyExistsFault') {
    log.info('using build workflow', config.swf.workflow.version);
  } else {
    log.error(err, 'error registering build workflow');
  }
});

swf.client.registerActivityType({
  domain: config.workflow.domain,
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
    return [ {
      decisionType: 'FailWorkflowExecution',
      failWorkflowExecutionDecisionAttributes: {
        reason: 'Task timed out'
      }
    } ];
  },
  ScheduleActivityTaskFailed: function(task, event) {
    log.warn('ScheduleActivityTaskFailed decider', event);
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
  }
};

function decide(decisionTask, next) {
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
      swf.client.respondDecisionTaskCompleted({
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

exports.stats = function() {
  return module.statistics;
};

// start handling decision tasks
exports.createServer = function(callback) {
  function pollForDecisionTasks() {
    log.info('polling');
    swf.client.pollForDecisionTask({
      domain: config.workflow.domain,
      taskList: config.swf.decisions,
      identity: [ 'decider', os.hostname(), process.pid ].join('-'),
      reverseOrder: true
    }, function(err, data) {
      if (err) {
        log.error(err, 'error polling for decision');
      } else {
        decide(data, pollForDecisionTasks);
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
        swf.client.countOpenWorkflowExecutions({
          domain: config.workflow.domain,
          startTimeFilter: interval
        }, function(err, data) {
          next(err, data ? data.count : null);
        })
      },
      closed: function(next) {
        swf.client.countClosedWorkflowExecutions({
          domain: config.workflow.domain,
          startTimeFilter: interval
        }, function(err, data) {
          next(err, data ? data.count : null);
        })
      },
      completed: function(next) {
        swf.client.countClosedWorkflowExecutions({
          domain: config.workflow.domain,
          startTimeFilter: interval,
          closeStatusFilter: { status: 'COMPLETED' }
        }, function(err, data) {
          next(err, data ? data.count : null);
        })
      }
    }, function(err, results) {
      if (err) {
        log.error(err, 'error checking stats');
      } else {
        results.interval = interval;
        module.statistics = results;
      }
    });
  }
  setInterval(updateStats, 1000 * 120);
  updateStats();
  
  callback();
};

// start the workflow for a build
exports.startWorkflow = function(id, spec, callback) {
  log.info({ spec: spec }, 'startWorkflow', id);
  swf.client.startWorkflowExecution({
    domain: config.workflow.domain,
    workflowId: id,
    workflowType: config.swf.workflow,
    input: JSON.stringify(spec)
  }, function(err, data) {
    if (err) {
      log.error(err, 'startWorkflowExecution error');
      err.dmesg = 'failed to start workflow execution'
    }
    callback(err);
  })
};

// add a listener for events by build id
exports.on = function(id, callback) {
  emitter.on(id, callback);
};

exports.removeListener = function(id, callback) {
  emitter.removeListener(id, callback);
};
