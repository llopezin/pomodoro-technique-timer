let timeSet = 25;
let min = 25;
let sec = 0;
let timeInterval;

function runTimer() {
  function start() {
    if (sec === 0 && min === 0) {
      clearInterval(timeInterval);
    } else if (sec === 0) {
      min = min - 1;
      sec = 59;
    } else {
      sec = sec - 1;
    }
    renderTime(min, sec);
  }
  timeInterval = setInterval(start, 1000);
}

function renderTime(min, sec) {
  $("#timer").html(`${min}:${("0" + sec).slice(-2)}`);
}
renderTime(25, 0);

// pause
$("button#pause").on("click", function() {
  clearInterval(timeInterval);
});

//start
$("button#start").on("click", function() {
  runTimer();
});

//reset
$("button#reset").on("click", function() {
  min = timeSet;
  sec = 0;
  renderTime(timeSet, 0);
  clearInterval(timeInterval);
});

//pomodoro
$("label[for='pomodoro']").on("click", function() {
  timeSet = min = 25;
  renderTime(25, 0);
  clearInterval(timeInterval);
});

//short break
$("label[for='shortBreak']").on("click", function() {
  timeSet = min = 5;
  renderTime(5, 0);
  clearInterval(timeInterval);
});

//long break
$("label[for='longBreak']").on("click", function() {
  timeSet = min = 10;
  renderTime(10, 0);
  clearInterval(timeInterval);
});
