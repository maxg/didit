// toggle staff mode on and off
$('#stafftoggle').on('click', function() {
  var staffmode = $(this).hasClass('btn-warning');
  document.cookie = 'staffmode=' + ( ! staffmode) + '; path=/';
  location.reload();
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
