

//----------------------------------------------------------------------
// use to calibrate the current camera setup
//----------------------------------------------------------------------
const ROWS = 5;
const COLS = 16;
var crop = [ 0, 0, 640, 480 ];

var bpm = 90.0;   // beats per minute


var context = new AudioContext();
var sound_prefix = "sounds/";
var drumBuffers = { };
var playing = false;   // is beat machine playing or paused
var scheduled = [ ];  // scheduled audio buffers
var canvas;
var ctx; // canvas rendering context
var video;  // <video> element


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
  "cyan" : "clap"
};



//------------------------------------------------------------------------
// start / stop video tracking
//------------------------------------------------------------------------
var videoStream = null;
function startStop() {
  var video = document.querySelector("#video");
  if (videoStream != null) {
    //trackerTask.stop();
    videoStream.getTracks().forEach(function(track) { track.stop(); });
    videoStream = null;
    document.getElementById("video-button").innerHTML = "Start Video";
  }
  else {
    navigator.mediaDevices.getUserMedia({ video: true })
      .then(function (s) {
        videoStream = s;
        video.srcObject = s;
        video.onloadedmetadata = function(e) { video.play(); };
        document.getElementById("video-button").innerHTML = "Stop Video";
        tick(0);
      })
      .catch(function (err) { console.log("Unable to start video stream!"); });
  }
}


//------------------------------------------------------------------------
// scan an image for color match
//------------------------------------------------------------------------
function scanRect(idata, bx, by, bw, bh, cw) {
  bx = Math.round(bx);
  by = Math.round(by);
  let count = 0, r = 0, g = 0, b = 0;
  for (let y = 0; y < bh; y++) {
    for (let x = 0; x < bw; x++) {
      let index = ((y + by) * cw + (x + bx)) * 4;
      r += idata.data[index + 0];
      g += idata.data[index + 1];
      b += idata.data[index + 2];
      count ++;
    }
  }
  return [ r/count, g/count, b/count ];
}


//------------------------------------------------------------------------
// distance between two colors
//------------------------------------------------------------------------
function colorDistance(a, b) {
  return Math.sqrt(
    (b[0] - a[0]) * (b[0] - a[0]) +
    (b[1] - a[1]) * (b[1] - a[1]) +
    (b[2] - a[2]) * (b[2] - a[2]));
}


//------------------------------------------------------------------------
// repaint the canvas
//------------------------------------------------------------------------
function draw(beats) {
  if (canvas && ctx) {
    let w = canvas.width;
    let h = canvas.height;
    let cx = crop[0];
    let cy = crop[1];
    let cw = Math.max(crop[2], 1);
    let ch = Math.max(crop[3], 1);
    let bw = cw / COLS;
    let bh = ch / ROWS;

    ctx.save();
    ctx.fillStyle = "black";
    ctx.fillRect(0, 0, w, h);

    ctx.drawImage(video, cx, cy, cw, ch, cx, cy, cw, ch);
    let idata = ctx.getImageData(cx, cy, cw, ch);
    let m = bw / 4.0;

    for (let i=0; i<16; i++) {
      for (let j=0; j<5; j++) {
        let bx = i * bw;
        let by = j * bh;
        let scan = scanRect(idata, bx + m, by + m, bw - m * 2, bh - m * 2, cw);

        let dist = colorDistance([0, 0, 0], scan);
        let dR = colorDistance([255, 0, 0], scan);
        let dG = colorDistance([100, 255, 100], scan);
        let dB = colorDistance([ 0, 0, 255], scan);
        let dO = colorDistance([ 255, 200, 0], scan);
        let color = 'rgba(0,0,0,0)';
        if (dR < dist) {
          color = 'red';
          dist = dR;
        }
        if (dG < dist) {
          color = 'green';
          dist = dG;
        }
        if (dB < dist) {
          color = 'blue';
          dist = dB;
        }
        if (dO < dist) {
          color = 'orange';
          dist = dO;
        }
        //ctx.fillStyle = `rgb(${color[0]}, ${color[1]}, ${color[2]})`;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(cx + bx + bw/2, cy + by + bh/2, m, 0, Math.PI * 2);
        ctx.fill();
      }
    }
/*
    ctx.beginPath();
    ctx.moveTo(beatsToX(beats), cropTop);
    ctx.lineTo(beatsToX(beats), canvas.height - cropBottom);
    ctx.strokeStyle = "gold";
    ctx.lineWidth = 5;
    ctx.stroke();

    for (let i=0; i<4.0; i += 0.25) {
      ctx.fillStyle = "white";
      ctx.font = "15px sans-serif";
      ctx.fillText("|", beatsToX(i), canvas.height - cropBottom + 18);
    }

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
    */
    ctx.restore();
  }
}



function isRunning() {
  return videoStream != null;
}



function secondsToBeats(s) {
  return s * bpm / 60.0;
}



function beatsToSeconds(beats) {
  return 60.0 * beats / bpm;
}


function beatsToX(beats) {
  let cw = crop[3];
  let beatWidth = cw / 4.0;
  return crop[0] + beatWidth * beats + beatWidth * 0.125;
}


function xToBeats(x) {
  let cw = crop[3];
  let beatWidth = cw / 4.0;
  x -= crop[0];
  x -= beatWidth * 0.125;
  let p = x / cw;
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
  if (isRunning()) {
    draw(0);
    window.requestAnimationFrame(tick);
  }
  if (playing) {
    beats = secondsToBeats((context.currentTime - start_time) % beatsToSeconds(4.0));
    if (beats > 2.5 && !queued) {
      queueSequence();
    }
    else if (beats < 2 && queued) {
      queued = false;
    }
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
  } else {
    start_time = context.currentTime;
    queueSequence();
    //timer = setInterval(function () { tick(); } , beatsToSeconds(0.125) * 1000);
    document.getElementById("play-pause").innerHTML = "Pause";
    playing = true;
    //trackerTask.run();
    //formatCode();
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

function isBlue(r, g, b) {
  return colorMatch("blue", r, g, b);
}

function isCyan(r, g, b) {
  return colorMatch("cyan", r, g, b);
  //return !isBlue(r, g, b) && (r > 20 && r < 100 && g > 150 && b > 150);
}

function isPurple(r, g, b) {
  return colorMatch("purple", r, g, b);
  //return (r > 180 && g < 110 && b > 150);
}

function isGreen(r, g, b) {
  return colorMatch("green", r, g, b);
  //return (r > 100 && r < 200 && g > 150 && b < 150);
}

function isOrange(r, g, b) {
  return colorMatch("orange", r, g, b);
  //return (r > 200 && g > 130 && b < 80);
}


window.onload = function() {
  video = document.querySelector("#video");
  canvas = document.querySelector('#canvas');
  ctx = canvas.getContext('2d');

  let dragging = false;
  canvas.onmousedown = function(e) {
    crop[0] = e.offsetX;
    crop[1] = e.offsetY;
    crop[2] = 0;
    crop[3] = 0;
    dragging = true;
  }
  canvas.onmousemove = function(e) {
    if (dragging) {
      crop[2] = e.offsetX - crop[0];
      crop[3] = e.offsetY - crop[1];
    }
  }
  canvas.onmouseup = function(e) {
    if (crop[2] <= 0 || crop[3] <= 0) {
      crop = [ 0, 0, canvas.width, canvas.height ];
    }
    dragging = false;
  }

  document.onkeydown = function(k) {
    //console.log(k.keyCode);
    switch(k.keyCode) {
      case 38: crop[1] -= 1; break;
      case 40: crop[1] += 1; break;
      case 39: crop[0] += 1; break;
      case 37: crop[0] -= 1; break;
      case 187: // zoom in
        break;
      case 189:  // zoom out
        break;
      case 70:  // 'f'
        console.log(crop);
        break;
    }
  }
}
