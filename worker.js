var aws = require('aws-sdk');
var os = require('os');

var config = require('./config');
var builder = require('./builder');
var log = require('./logger').cat('worker');

aws.config.loadFromPath('./config/aws.json');

var swf = new aws.SimpleWorkflow();

function perform(task, next) {
  if ( ! task.taskToken) {
    next();
    return;
  }
  
  log.info('perform', task);
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
}

function pollForActivities() {
  log.info('polling');
  swf.client.pollForActivityTask({
    domain: config.workflow.domain,
    taskList: config.swf.activities,
    identity: [ 'worker', os.hostname(), process.pid ].join('-')
  }, function(err, data) {
    if (err) {
      log.error(err, 'error polling for activity');
    } else {
      perform(data, pollForActivities);
    }
  });
}

if (require.main === module) {
  pollForActivities();
}
