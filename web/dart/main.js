const bpm = 90.0;
const bps = bpm / 60.0;
const secondsPerBeat = 1.0 / bps;
const secondsPerMeasure = 4.0 * secondsPerBeat;
var msPerMeasure = Math.round(secondsPerMeasure * 1000);

function beatsToSeconds(beats) { return beats * secondsPerBeat; }

function secondsToBeats(s) { return s * bps; }

function beatsToX(beats) { return ((beats % 4.0) / 4.0) * (w - 100) + 50; }

/// canvas dimensions
const w = 900;
const h = 300;

var start_time = 0;

var colors = [ "blue", "purple", "orange", "green", "cyan" ];    
var drums = [ "kick", "snare", "hat", "tom", "clap" ];

var playing = false;
  
var context = null;
  
// sounds scheduled to be played
var scheduled = [];
  
// AudioBuffers with drum sounds
var drumBuffers = { };
 
var slots = [ ];

var start_time = 0;

var playhead;



function Slot(row, col, color, drum, c) {
  this.on = false;
  this.row = row;
  this.col = col;
  this.color = color;
  this.drum = drum;
  var r = 25;
  var circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
  
  var x = col * r * 2 + r + 50;
  var y = row * r * 2 + r + 25;
  circle.setAttribute('cx', x);
  circle.setAttribute('cy', y);
  circle.setAttribute('r', r - 10);
  circle.setAttribute('fill', '#0002');
  circle.setAttribute('class', 'slot');
  c.appendChild(circle);
  var self = this;
  circle.onclick = function() {
    if (self.on) {
      circle.setAttribute("fill", "#0002");
      circle.setAttribute("r", r - 12);
    } else {
      circle.setAttribute("fill", self.color);
      circle.setAttribute("r", r - 5);
      playSound(self.drum + ".wav", 0);
    }
    self.on = !self.on;
  }
}


//------------------------------------------------------------------------
// start / stop playback
//------------------------------------------------------------------------
function playPause() {
  if (playing) {
    playing = false;
    stopSounds();
    document.getElementById("play-button").innerHTML = "Play";
  }
  else {
    start_time = context.currentTime;
    queueSequence();
    playing = true;
    document.getElementById("play-button").innerHTML = "Stop";
    tick(0);
  }
}


//------------------------------------------------------------------------
// queue sequence of balls to start playback
//------------------------------------------------------------------------
 function queueSequence() {
  scheduled = [];
  let now = context.currentTime;
  let bar = Math.round((now - start_time) / beatsToSeconds(4.0));
  let start = start_time + bar * beatsToSeconds(4.0);

  for (let slot of slots) {
    if (slot.on) {
      let time = beatsToSeconds(slot.col / 4.0);
      playSound(slot.drum + ".wav", start + time);
    }
  }
  queued = true;
}
var queued = false;


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
  let url = "sounds/" + name;
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
// while playing redraw the screen and schedule each new measure
//------------------------------------------------------------------------
function tick(timestamp) {
  if (playing) {
    let now = context.currentTime;
    beats = secondsToBeats((now - start_time) % secondsPerMeasure);
    draw(beats);
    window.requestAnimationFrame(tick);
    if (beats > 3.5 && !queued) {
      queueSequence();
    }
    else if (beats < 1 && queued) {
      queued = false;
    }
  }
}


//------------------------------------------------------------------------
// refresh the playhead
//------------------------------------------------------------------------
function draw(beats) {
  let x = beatsToX(beats);
  playhead.setAttribute("x1", x);
  playhead.setAttribute("x2", x);
}


//------------------------------------------------------------------------
// create the slots of the drum machine and load sounds
//------------------------------------------------------------------------
window.onload = function() {

  var container = document.getElementById("beat-machine");
  
  for (let drum of drums) {
    loadDrumSound(drum + ".wav");
  }

  var rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  rect.setAttribute("x", 0);
  rect.setAttribute("y", 0);
  rect.setAttribute("width", w);
  rect.setAttribute("height", h);
  rect.setAttribute("fill", "#f7f7f2");
  container.appendChild(rect);

  for (let i = 0; i < 16; i++) {
    for (let j = 0; j < 5; j++) {
      slots.push(new Slot(j, i, colors[j], drums[j], container, this));
    }
  }
  
  playhead = document.createElementNS("http://www.w3.org/2000/svg", "line");
  playhead.setAttribute("x1", 0);
  playhead.setAttribute("y1", 0);
  playhead.setAttribute("x2", 0);
  playhead.setAttribute("y2", h);
  playhead.setAttribute("fill", "none");
  playhead.setAttribute("stroke", "gold");
  playhead.setAttribute("stroke-width", 6);
  container.appendChild(playhead);

  context = new AudioContext();
    
  document.getElementById("play-button").onclick = playPause;
}

