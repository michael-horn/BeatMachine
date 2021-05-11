/*
 * TunePad
 *
 * Michael S. Horn
 * Northwestern University
 * michael-horn@northwestern.edu
 * Copyright 2021, Michael S. Horn
 *
 * This project was funded by the National Science Foundation (grant DRL-1612619).
 * Any opinions, findings and conclusions or recommendations expressed in this
 * material are those of the author(s) and do not necessarily reflect the views
 * of the National Science Foundation (NSF).
 */

//----------------------------------------------------------
// global list of current midi devices
//----------------------------------------------------------
var _midiDevices = { };
var _midiOutputs = [ ];

//----------------------------------------------------------
// Sets up the MIDIAccess object and starts listening for events.
//----------------------------------------------------------
function midiInit() {
  if (typeof navigator.requestMIDIAccess === "function") {
    navigator.requestMIDIAccess({ sysex: true }).then(
      function (midi) {
        midi.onstatechange = _midiConnection;
        for (var input of midi.inputs.values()) {
          input.onmidimessage = _midiEvent;
          _midiDevices[input.id] = input.name;
        }
        for (let output of midi.outputs.values()) {
          _midiOutputs.push(output);
          output.open();
        }
      },
      function () { console.log("Failed to initialize web MIDI."); });
  }
}


//----------------------------------------------------------
// Returns a list of connected midi device names as a
// stringified JSON object
//----------------------------------------------------------
function getMidiDevices() {
  return JSON.stringify(_midiDevices);
}


//----------------------------------------------------------
// Fired when midi devices are added or removed. The
// parameter passed is a MIDIConnectionEvent.
//----------------------------------------------------------
function _midiConnection( event ) {
  var port = event.port; // MIDIPort
  if (port.type == "input" && port.state == "connected") {
    _midiDevices[port.id] = port.name;
    port.onmidimessage = _midiEvent;
    console.log('MIDI device connected.');
  }
  else if (port.type == "input" && port.state == "disconnected") {
    delete _midiDevices[port.id];
  }
}


//----------------------------------------------------------
// Processes incoming midi events and send it to a dart
// callback function
//----------------------------------------------------------
function _midiEvent(event) {
  var cmd = event.data[0] >> 4;
  var channel = event.data[0] & 0xf;
  var note = event.data[1];
  var velocity = 0;
  if (event.data.length >= 3) velocity = event.data[2];
  var data = {
    "command" : cmd,
    "channel" : channel,
    "note" : note,
    "velocity" : velocity,
    "port" : event.target.id,
    "timestamp" :  event.timeStamp
  };
  midiEvent(data);
}
