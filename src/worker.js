const async = require('async');
const aws = require('aws-sdk');
const events = require('events');
const os = require('os');

const config = require('./config');
const builder = require('./builder');
const log = require('./logger').cat('worker');

const swf = new aws.SimpleWorkflow({ params: { domain: config.workflow.domain } });

const concurrency = config.build.concurrency || 1;
const mon = new events.EventEmitter();

let closed = false;
let running = 0;

const queue = async.queue(function perform(task, next) {
  if ( ! task.taskToken) {
    next();
    return;
  }
  
  log.info({ running }, 'perform', task.activityId);
  let spec = JSON.parse(task.input);
  builder.build(spec, function(progress) {
    log.info('signal progress', progress);
    swf.signalWorkflowExecution({
      workflowId: task.workflowExecution.workflowId,
      runId: task.workflowExecution.runId,
      signalName: config.swf.signals.progress,
      input: JSON.stringify({ message: progress })
    }, function(err, data) {
      if (err) {
        log.error(err, 'error signaling workflow');
      }
    });
  }, function(err, result) {
    swf.respondActivityTaskCompleted({
      taskToken: task.taskToken,
      result: JSON.stringify({
        spec,
        err,
        result
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
  log.info({ running }, 'polling');
  swf.pollForActivityTask({
    taskList: config.swf.activities,
    identity: [ 'worker', os.hostname(), process.pid ].join('-')
  }, function(err, data) {
    if (err) {
      log.error(err, 'error polling for activity');
      setTimeout(pollForActivities, 1000 * 60 * 4);
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
  log.info({ running }, 'queue empty');
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
log.info({ concurrency }, 'worker started');

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
