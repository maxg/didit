var async = require('async');
var aws = require('aws-sdk');
var events = require('events');
var os = require('os');

var config = require('./config');
var builder = require('./builder');
var log = require('./logger').cat('worker');

var swf = new aws.SimpleWorkflow();

var closed = false;
var concurrency = config.build.concurrency || 1;
var running = 0;
var mon = new events.EventEmitter();

var queue = async.queue(function perform(task, next) {
  if ( ! task.taskToken) {
    next();
    return;
  }
  
  log.info({ running: running }, 'perform', task.activityId);
  var spec = JSON.parse(task.input);
  builder.build(spec, function(progress) {
    log.info('signal progress', progress);
    swf.client.signalWorkflowExecution({
      domain: config.workflow.domain,
      workflowId: task.workflowExecution.workflowId,
      runId: task.workflowExecution.runId,
      signalName: config.swf.signals.progress,
      input: JSON.stringify({ message: progress })
    }, function(err, data) {
      if (err) {
        log.error(err, 'error signaling workflow');
      }
    })
  }, function(err, result) {
    swf.client.respondActivityTaskCompleted({
      taskToken: task.taskToken,
      result: JSON.stringify({
        spec: spec,
        err: err,
        result: result
      })
    }, function(err, data) {
      if (err) {
        log.error(err, 'error completing activity');
      }
      next();
    });
  });
}, concurrency);

function pollForActivities() {
  log.info({ running: running }, 'polling');
  swf.client.pollForActivityTask({
    domain: config.workflow.domain,
    taskList: config.swf.activities,
    identity: [ 'worker', os.hostname(), process.pid ].join('-')
  }, function(err, data) {
    if (err) {
      log.error(err, 'error polling for activity');
    } else {
      running++;
      queue.push(data, function() {
        running--;
        mon.emit('done');
      });
    }
  });
}

queue.empty = function() {
  if (closed) {
    log.info('closing server');
    return;
  }
  log.info({ running: running }, 'queue empty');
  if (running >= concurrency) {
    mon.once('done', pollForActivities);
  } else {
    pollForActivities();
  }
};

function stopPolling(callback) {
  log.info('will close');
  closed = true;
  queue.drain = callback;
}

pollForActivities();
log.info({ concurrency: concurrency }, 'worker started');

process.on('SIGTERM', function() {
  log.info('SIGTERM');
  async.parallel([
    stopPolling
  ], function(err) {
    if (err) { log.error(err, 'error closing servers'); }
    log.info('exiting');
    process.exit();
  });
});
