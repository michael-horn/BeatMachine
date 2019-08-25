

//----------------------------------------------------------------------
// use to calibrate the current camera setup
//----------------------------------------------------------------------
var cropLeft = 70;
var cropRight = 70;
var cropTop = 280;
var cropBottom = 130;

var bpm = 90.0;   // beats per minute


var context = new AudioContext();
var sound_prefix = "sounds/";
var drumBuffers = { };
var playing = false;
var scheduled = [ ];  // scheduled audio buffers
var canvas;
var ctx; // canvas rendering context

//------------------------------------------------------------------------
// pre-load the drum samples
//------------------------------------------------------------------------
loadDrumSound("kick.wav");
loadDrumSound("snare.wav");
loadDrumSound("tom.wav");
loadDrumSound("hat.wav");
loadDrumSound("clap.wav");


//------------------------------------------------------------------------
// all of the balls recognized by the camera in this frame
//------------------------------------------------------------------------
var balls = [];


//------------------------------------------------------------------------
// maps ball color to drum sound
//------------------------------------------------------------------------
var colors = {
  "blue" : "kick",
  "purple" : "snare",
  "orange" : "hat",
  "green" : "tom",
  "cyan" : "clap",
  "aqua" : "clap"
};



function secondsToBeats(s) {
  return s * bpm / 60.0;
}



function beatsToSeconds(beats) {
  return 60.0 * beats / bpm;
}


function beatsToX(beats) {
  let w = canvas.width - (cropLeft + cropRight);
  let beatWidth = w / 4.0;
  return canvas.width - (cropLeft + beatWidth * beats);
}


function xToBeats(x) {
  let w = canvas.width - (cropLeft + cropRight);
  let beatWidth = w / 4.0;
  x = (canvas.width - cropRight - beatWidth * 0.25) - x;
  let p = x / w;
  let slice = Math.round(p * 16.0);
  return slice / 4.0;
}



//------------------------------------------------------------------------
// stop all sounds
//------------------------------------------------------------------------
function stopSounds() {
  for (let sound of scheduled) { sound.stop(0); }
  scheduled = [];
}


//------------------------------------------------------------------------
// schedule sound to be played
//------------------------------------------------------------------------
function playSound(name, time) {
  var buffer = drumBuffers[name]; 
  var source = context.createBufferSource(); // creates a sound source
  source.buffer = buffer;                    // tell the source which sound to play
  source.connect(context.destination);       // connect the source to the context's destination (the speakers)
  source.start(time);  
  scheduled.push(source);
}


//------------------------------------------------------------------------
// load drum sound from the given url
//------------------------------------------------------------------------
function loadDrumSound(name) {
  let url = sound_prefix + name;
  let request = new XMLHttpRequest();
  request.open('GET', url, true);
  request.responseType = 'arraybuffer';

  request.onload = function() {
    context.decodeAudioData(request.response, function(buffer) {
      drumBuffers[name] = buffer; 
    }, function () { console.log("error loading audio")});
  }
  request.send();
}


//------------------------------------------------------------------------
// queue sequence of balls to start playback
//------------------------------------------------------------------------
function queueSequence() {
  scheduled = [];
  let now = context.currentTime;
  let bar = Math.round((now - start_time) / beatsToSeconds(4.0));
  let start = start_time + bar * beatsToSeconds(4.0);

  for (let ball of balls) {
    let drum = ball.drum + ".wav";
    let time = beatsToSeconds(ball.beat);
    playSound(drum, start + time);
  }
  queued = true;
}
var queued = false;    


//------------------------------------------------------------------------
// while playing redraw the screen and schedule each new measure
//------------------------------------------------------------------------
function tick(timestamp) {
  if (playing) {
    beats = secondsToBeats((context.currentTime - start_time) % beatsToSeconds(4.0));
    draw(beats);
    window.requestAnimationFrame(tick);
    if (beats > 2.5 && !queued) {
      queueSequence();
    }
    else if (beats < 2 && queued) {
      queued = false;
    }
  }
}


//------------------------------------------------------------------------
// repaint the canvas
//------------------------------------------------------------------------
function draw(beats) {
  if (canvas && ctx) {
    let w = canvas.width;
    let h = canvas.height;
    ctx.save();
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "black";
    ctx.fillRect(0, 0, cropLeft, h);
    ctx.fillRect(0, h - cropBottom, w, cropBottom);
    ctx.fillRect(w - cropRight, 0, cropRight, h);
    ctx.fillRect(0, 0, w, cropTop);
    ctx.lineWidth = 3;
    ctx.fillStyle = "gold";
    for (let ball of balls) {
      ctx.strokeStyle = ball.color;
      ctx.beginPath();
      ctx.arc(ball.cx, ball.cy, ball.r + 2, 0, Math.PI*2, true);
      ctx.stroke();
      if (beats > ball.beat && beats < ball.beat + 0.25) {
        ctx.fill();
      }
    }
    ctx.restore();
    ctx.beginPath();
    ctx.moveTo(beatsToX(beats), cropTop);
    ctx.lineTo(beatsToX(beats), canvas.height - cropBottom);
    ctx.strokeStyle = "gold";
    ctx.lineWidth = 5;
    ctx.stroke();
  }
}


//------------------------------------------------------------------------
// tracker callback function
//------------------------------------------------------------------------
function foundBall(ball) {
  ball.cx = ball.x + ball.width / 2;
  ball.cy = ball.y + ball.height;
  ball.r = ball.width / 2;
  if (ball.r <= 30 &&
      ball.cx > cropLeft && ball.cx < canvas.width - cropRight &&
      ball.cy > cropTop && ball.cy < canvas.height - cropBottom)
  {
    ball.beat = xToBeats(ball.cx);
    ball.slice = Math.floor(ball.beat * 4.0);
    ball.drum = colors[ball.color];
    balls.push(ball);
  }
}



//------------------------------------------------------------------------
// start / stop video tracking
//------------------------------------------------------------------------
function playPause() {
  if (playing) {
    //clearInterval(timer);
    stopSounds();
    document.getElementById("play-pause").innerHTML = "Play";
    playing = false;
    document.getElementById("video").pause();
  } else {
    start_time = context.currentTime;
    queueSequence();
    //timer = setInterval(function () { tick(); } , beatsToSeconds(0.125) * 1000);
    document.getElementById("play-pause").innerHTML = "Stop";
    playing = true;
    tick(0);
    formatCode();
    document.getElementById("video").play();
  }
}
var timer = 0;
var start_time = 0;


//------------------------------------------------------------------------
// format code for TunePad
//------------------------------------------------------------------------
function formatCode() {
  if (playing) {
    var patterns = {
      'kick' : [ '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-' ],
      'snare' : [ '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-' ],
      'hat' : [ '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-' ],
      'tom' : [ '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-' ],
      'clap' : [ '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-' ]
    };

    for (let ball of balls) {
      patterns[ball.drum][ball.slice] = '*';
    }
    var code = "<h1>Python Code</h1>";
    for (let drum in patterns) {
      code += ('playPattern(' + drum + ', "' + patterns[drum].join('') + '")<br>');
    }
    document.getElementById("code").innerHTML = code;
  }
}


//------------------------------------------------------------------------
// calibrate ball colors
//------------------------------------------------------------------------
tracking.ColorTracker.registerColor('blue', isBlue);
tracking.ColorTracker.registerColor('orange', isOrange);
tracking.ColorTracker.registerColor('green', isGreen);
tracking.ColorTracker.registerColor('purple', isPurple);
tracking.ColorTracker.registerColor('cyan', isCyan);
//tracking.ColorTracker.registerColor('aqua', isAqua);


function isBlue(r, g, b) {
  return (r < 60 && g < 150 && b > 130);
}

function isCyan(r, g, b) {
  return !isBlue(r, g, b) && (r > 20 && r < 100 && g > 150 && b > 150);
}

//function isAqua(r, g, b) {
//  return !isBlue(r, g, b) && (r > 90 && r < 130 && g > 190 && b > 170);
//}

function isPurple(r, g, b) {
  return (r > 180 && g < 110 && b > 150);
}

function isGreen(r, g, b) {
  return (r > 100 && r < 200 && g > 150 && b < 150);
}

function isOrange(r, g, b) {
  return (r > 200 && g > 130 && b < 80);
}

window.onload = function() {
  canvas = document.getElementById('canvas');
  ctx = canvas.getContext('2d');

  // tracker callback function for each video frame
  //var tracker = new tracking.ColorTracker([ 'blue', 'cyan', 'green', 'orange', 'purple' ]);
  var tracker = new tracking.ColorTracker([ 'blue', 'green', 'cyan', 'orange', 'purple' ]);
  tracker.minDimension = 18;
  tracker.on('track', function(event) {
    balls = [];
    event.data.forEach(foundBall);
    formatCode();
  });

  // start the tracker
  tracking.track('#video', tracker, { camera : true });

  document.onkeydown = function(k) {
    console.log(k.keyCode);
    switch(k.keyCode) {
      case 38:
        cropTop -= 5;
        cropBottom += 5;
        break;
      case 40:
        cropTop += 5;
        cropBottom -= 5;
        break;
      case 39:
        cropLeft += 5;
        cropRight -= 5;
        break;
      case 37:
        cropLeft -= 5;
        cropRight += 5;
        break;
      case 187:
        cropLeft -= 3;
        cropRight -= 3;
        cropTop -= 1;
        cropBottom -= 1;
        break;
      case 189:
        cropLeft += 3;
        cropRight += 3;
        cropTop += 1;
        cropBottom += 1;
        break;
      case 70:  // 'f'
        break;
    }
  }
}



