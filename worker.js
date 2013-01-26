var aws = require('aws-sdk');
var os = require('os');

var config = require('./config');
var builder = require('./builder');

aws.config.loadFromPath('./config/aws.json');

var swf = new aws.SimpleWorkflow();

function perform(task, next) {
  if ( ! task.taskToken) {
    next();
    return;
  }
  
  console.log('[work]', 'perform', task);
  var spec = JSON.parse(task.input);
  builder.build(spec, function(progress) {
    console.log('[work]', 'signal progress', progress);
    swf.client.signalWorkflowExecution({
      domain: config.workflow.domain,
      workflowId: task.workflowExecution.workflowId,
      runId: task.workflowExecution.runId,
      signalName: config.swf.signals.progress,
      input: JSON.stringify({ message: progress })
    }, function(err, data) {
      if (err) {
        console.log('[work]', 'error signaling workflow', err);
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
        console.log('[work]', 'error completing activity', err);
      }
      next();
    });
  });
}

function pollForActivities() {
  console.log('[work]', 'polling');
  swf.client.pollForActivityTask({
    domain: config.workflow.domain,
    taskList: config.swf.activities,
    identity: [ 'worker', os.hostname(), process.pid ].join('-')
  }, function(err, data) {
    if (err) {
      console.log('[work]', 'error polling for activity', err);
    } else {
      perform(data, pollForActivities);
    }
  });
}

if (require.main === module) {
  pollForActivities();
}
