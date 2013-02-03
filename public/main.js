$('#stafftoggle').on('click', function() {
  var staffmode = $(this).hasClass('btn-warning');
  document.cookie = 'staffmode=' + ( ! staffmode) + '; path=/';
  location.reload();
});
