var async = require('async');
var aws = require('aws-sdk');
var events = require('events');
var os = require('os');

var config = require('./config');

aws.config.loadFromPath('./config/aws.json');

var swf = new aws.SimpleWorkflow();

swf.client.registerWorkflowType({
  domain: config.workflow.domain,
  name: config.swf.workflow.name,
  version: config.swf.workflow.version,
  defaultTaskList: config.swf.decisions
}, function(err, data) {
  if (data) {
    console.log('[decide]', 'registered build workflow', config.swf.workflow.version, data)
  } else if (err.code == 'TypeAlreadyExistsFault') {
    console.log('[decide]', 'using build workflow', config.swf.workflow.version);
  } else {
    console.log('[decide]', 'error registering build workflow', err);
  }
});

swf.client.registerActivityType({
  domain: config.workflow.domain,
  name: config.swf.activity.name,
  version: config.swf.activity.version,
  defaultTaskList: config.swf.activities
}, function(err, data) {
  if (data) {
    console.log('[decide]', 'registered build activity', config.swf.activity.version, data);
  } else if (err.code == 'TypeAlreadyExistsFault') {
    console.log('[decide]', 'using build activity', config.swf.activity.version);
  } else {
    console.log('[decide]', 'error registering build activity', err);
  }
});

var emitter = new events.EventEmitter();

var deciders = {
  ActivityTaskCompleted: function(task, event) {
    console.log('[decide]', 'ActivityTaskCompleted decider', event);
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
    console.log('[decide]', 'ActivityTaskTimedOut decider', event);
    return [ {
      decisionType: 'FailWorkflowExecution',
      failWorkflowExecutionDecisionAttributes: {
        reason: 'Task timed out'
      }
    } ];
  },
  ScheduleActivityTaskFailed: function(task, event) {
    console.log('[decide]', 'ScheduleActivityTaskFailed decider', event);
    return [ {
      decisionType: 'FailWorkflowExecution',
      failWorkflowExecutionDecisionAttributes: {
        reason: 'Failed to schedule ' + event.scheduleActivityTaskFailedEventAttributes.activityId
      }
    } ];
  },
  WorkflowExecutionSignaled: function(task, event) {
    console.log('[decide]', 'WorkflowExecutionSignaled decider', event);
    var attr = event.workflowExecutionSignaledEventAttributes;
    if (attr.signalName == config.swf.signals.progress) {
      emitter.emit(task.workflowExecution.workflowId, 'progress', JSON.parse(attr.input));
    }
  },
  WorkflowExecutionStarted: function(task, event) {
    console.log('[decide]', 'WorkflowExecutionStarted decider', event);
    var input = event.workflowExecutionStartedEventAttributes.input;
    emitter.emit(task.workflowExecution.workflowId, 'start', JSON.parse(input));
    return [ { decisionType: 'ScheduleActivityTask',
      scheduleActivityTaskDecisionAttributes: {
        activityId: [ task.workflowExecution.workflowId, 'all' ].join('-'),
        activityType: config.swf.activity,
        input: input,
        heartbeatTimeout: 'NONE', // XXX move to default
        scheduleToCloseTimeout: 'NONE', // XXX move to default
        scheduleToStartTimeout: '3600', // XXX move to default
        startToCloseTimeout: '30' // XXX move to default 600
      }
    } ];
  }
};

function decide(decisionTask, next) {
  if ( ! decisionTask.taskToken) {
    next();
    return;
  }
  
  console.log('[decide]', 'decide', decisionTask.workflowExecution);
  for (var ii = 0; ii < decisionTask.events.length; ii++) {
    var event = decisionTask.events[ii];
    if (deciders[event.eventType]) {
      var decisions = deciders[event.eventType](decisionTask, event);
      console.log('[decide]', 'decisions', decisions);
      swf.client.respondDecisionTaskCompleted({
        taskToken: decisionTask.taskToken,
        decisions: decisions || []
      }, function(err, data) {
        if (err) {
          console.log('[decide]', 'error deciding', err);
        }
        next();
      });
      return;
    }
  }
  console.log('[decide]', 'no decisions');
  next();
}

exports.stats = function() {
  return module.statistics;
};

// start handling decision tasks
exports.createServer = function(callback) {
  function pollForDecisionTasks() {
    console.log('[decide]', 'polling');
    swf.client.pollForDecisionTask({
      domain: config.workflow.domain,
      taskList: config.swf.decisions,
      identity: [ 'decider', os.hostname(), process.pid ].join('-'),
      reverseOrder: true
    }, function(err, data) {
      if (err) {
        console.log('[decide]', 'error polling for decision', err);
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
        console.log('[decide]', 'error checking stats', err);
      } else {
        results.interval = interval;
        module.statistics = results;
      }
    });
  }
  setInterval(updateStats, 1000 * 120);
  updateStats();
};

// start the workflow for a build
exports.startWorkflow = function(id, spec, callback) {
  console.log('[decide]', 'startWorkflow', id, spec);
  swf.client.startWorkflowExecution({
    domain: config.workflow.domain,
    workflowId: id,
    workflowType: config.swf.workflow,
    input: JSON.stringify(spec),
    executionStartToCloseTimeout: '3600', // XXX move to default
    taskStartToCloseTimeout: '30', // XXX move to default 600
    childPolicy: 'REQUEST_CANCEL' // XXX move to default
  }, function(err, data) {
    console.log('[decide]', 'startWorkflowExecution returned', err, data);
    if (err) {
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
