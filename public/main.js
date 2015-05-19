// set up progress bars
$('.progress .bar[data-width]').each(function() {
  this.style.width = $(this).data('width') + '%';
});

// toggle staff mode on and off
$('#stafftoggle').on('click', function() {
  var staffmode = $(this).hasClass('btn-warning');
  document.cookie = 'staffmode=' + ( ! staffmode) + '; path=/';
  location.reload();
});

// avoid double-submits
$('form.modal[method="post"]').on('submit', function(event) {
  $('button', event.target).prop('disabled', true);
});

// build a repo
$('#build-repo').on('click', function() {
  var spec = $(this).data('spec');
  $.post('/build/' + spec).done(function(data) {
    $('#build-output').text(data);
  }).fail(function(req) {
    $('#build-output').text(req.responseText);
  });
  $('#confirm-build').on('hidden.bs.modal', function() {
    $('#build-progress').modal('show');
  });
});

// initialize repo creation dialog
$('#create-repo').on('show.bs.modal', function(event) {
  var spec = $(this).data('modal').options;
  $('#create-repo').prop('action', '/start/'+spec.kind+'/'+spec.proj+'/'+spec.users);
  $('.create-repo-users-text').text(spec.users);
  $('#create-repo button').prop('disabled', false);
});
$('#create-repo').on('hidden.bs.modal', function(event) {
  $(this).removeData('modal'); // otherwise future data attributes are ignored
});
