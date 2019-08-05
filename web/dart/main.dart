import 'dart:html';
import 'dart:svg';
import 'dart:async';
import 'dart:web_audio';


const bpm = 90.0;
const bps = bpm / 60.0;
const secondsPerBeat = 1.0 / bps;
const secondsPerMeasure = 4.0 * secondsPerBeat;
final int msPerMeasure = (secondsPerMeasure * 1000).round();

num beatsToSeconds(num beats) => beats * secondsPerBeat;
num secondsToBeats(num s) => s * bps;




class Slot extends SVGTouchable {
  int row = 0;

  int col = 0;

  String color = "blue";

  String drum = "kick";

  num get radius => 25;
  
  CircleElement circle;
  
  bool on = false;

  DrumMachine machine;
  

  Slot(this.row, this.col, this.color, this.drum, SvgElement c, this.machine) : super(c) {
    moveTo(
      col * radius * 2 + radius + 50, 
      row * radius * 2 + radius + 25);

    circle = new CircleElement()
      ..attributes = {
        "cx": "0",
        "cy": "0",
        "r": "${radius - 10}",
        "fill": "#0002",
        "stroke": "none",
        "class": "slot"
      };
    target.append(circle);
  }


  bool touchDown(num touchX, num touchY) {
    if (on) {
      circle.setAttribute("fill", "#0002");
      circle.setAttribute("r", "${radius - 12}");
    } else {
      circle.setAttribute("fill", color);
      circle.setAttribute("r", "${radius - 5}");
      machine.playSound("$drum.wav", 0);
    }
    on = !on;
    return true;
  }

  void touchUp(num touchX, num touchY) {}

  void touchDrag(num touchX, num touchY, num deltaX, num deltaY) {}
}



class DrumMachine {
  /// canvas dimensions
  num w, h;

  num start_time = 0;

  //------------------------------------------------------------------------
  // maps ball color to drum sound
  //------------------------------------------------------------------------
  var colors = [ "blue", "purple", "orange", "green", "cyan" ];    
  var drums = [ "kick", "snare", "hat", "tom", "clap" ];
  
  LineElement playhead;
  
  Timer animator = null;
  
  AudioContext context = null;
  
  // sounds scheduled to be played
  List<AudioBufferSourceNode> scheduled = new List<AudioBufferSourceNode>();
  
  // AudioBuffers with drum sounds
  Map<String, AudioBuffer> drumBuffers = new Map<String, AudioBuffer>();
 
  String sound_prefix = "sounds/";
  
  List<Slot> slots = new List<Slot>();


  DrumMachine(SvgElement container, this.w, this.h) {
    for (String drum in drums) {
      loadDrumSound("$drum.wav");
    }
    
    RectElement rect = new RectElement()
      ..attributes = {
        "x": "0",
        "y": "0",
        "width": "$w",
        "height": "$h",
        "fill": "#f2f2f2"
      };
    container.append(rect);

    for (int i = 0; i < 16; i++) {
      for (int j = 0; j < 5; j++) {
        slots.add(new Slot(j, i, colors[j], drums[j], container, this));
      }
    }
    
    playhead = new LineElement()
      .. attributes = {
        "x2" : "200",
        "y2" : "0",
        "x1" : "200",
        "y1" : "$h",
        "fill" : "none",
        "stroke" : "gold",
        "stroke-width" : "6"
    };
    container.append(playhead);
    
    context = new AudioContext();
    
    querySelector("#play-button").onClick.listen((e) {
      playPause();
    });
  }
  
  
  void playPause() {
    if (animator == null) {
      animator = new Timer.periodic(new Duration(milliseconds : msPerMeasure), (t) {
        //refresh(beats);
        queueSequence();
      });
      querySelector("#play-button").innerHtml = "Pause";
      start_time = context.currentTime;
      queueSequence();
    } else {
      stopSounds();
      animator.cancel();
      animator = null;
      querySelector("#play-button").innerHtml = "Play";
    }
  }

  
  //------------------------------------------------------------------------
  // schedule sound to be played
  //------------------------------------------------------------------------
  void playSound(String name, num time) {
    AudioBuffer buffer = drumBuffers[name]; 
    AudioBufferSourceNode source = context.createBufferSource();
    source.buffer = buffer;
    source.connectNode(context.destination);
    source.start(time);
    scheduled.add(source);
  }
  
  
  //------------------------------------------------------------------------
  // stop all sounds
  //------------------------------------------------------------------------
  void stopSounds() {
    for (AudioBufferSourceNode sound in scheduled) { 
      sound.stop(0); 
    }
    scheduled.clear();
  }


  //------------------------------------------------------------------------
  // load drum sound from the given url
  //------------------------------------------------------------------------
  void loadDrumSound(name) {
    String url = sound_prefix + name;
    
    HttpRequest request = new HttpRequest();
    request.open("GET", url, async: true);
    request.responseType = "arraybuffer";
    request.onLoad.listen((e) async {
      AudioBuffer buffer = await context.decodeAudioData(request.response);
      if (buffer != null) {
        drumBuffers[name] = buffer;
      }
    });
    request.onError.listen((e) => print("BufferLoader: XHR error"));
    request.send();
  }


  //------------------------------------------------------------------------
  // queue sequence of balls to start playback
  //------------------------------------------------------------------------
  void queueSequence() {
    num now = context.currentTime;
    num measure = (now - start_time) ~/ secondsPerMeasure;
    num start = start_time + measure * secondsPerMeasure;

    for (Slot slot in slots) {
      if (slot.on) {
        String drum = drums[slot.row] + ".wav";
        num time = beatsToSeconds(slot.col / 4.0);
        playSound(drum, start + time);
      }
    }
  }
  
  
  void refresh(num beats) {
    num x = beatsToX(beats);
    playhead.setAttribute("x1", "$x");
    playhead.setAttribute("x2", "$x");
  }
  
  
  num beatsToX(num beats) {
    num p = (beats % 4.0) / 4.0;
    return 50 + 800 * p;
  }
}


abstract class SVGTouchable {
  /// SVG element that contains the touchable object. Can be a
  /// group, <svg> tag, or other object.
  SvgElement parent;

  /// Group that contains all of the visual elements for this touchable
  GElement target;

  /// location of this object inside the parent
  num get x => _x;
  num get y => _y;
  set x(num newX) => moveTo(newX, y);
  set y(num newY) => moveTo(x, newY);

  /// is this object currently being dragged on the screen?
  bool get isDragging => _dragging;

  /// list of touch event subscriptions
  List<StreamSubscription> subscriptions = new List<StreamSubscription>();

  bool _dragging = false;
  num _x = 0, _y = 0;
  num _lastX = 0, _lastY = 0;

  SVGTouchable(this.parent) {
    target = new GElement();
    parent.append(target);

    // set up the mouse events for this touchable
    subscriptions.add(target.onMouseDown.listen((e) {
      _lastX = e.client.x;
      _lastY = e.client.y;
      _dragging = touchDown(_lastX, _lastY);
      e.stopPropagation();
    }));

    subscriptions.add(document.onMouseMove.listen((e) {
      if (_dragging) {
        num tx = e.client.x;
        num ty = e.client.y;
        touchDrag(tx, ty, tx - _lastX, ty - _lastY);
        _lastX = tx;
        _lastY = ty;
      }
    }));

    subscriptions.add(document.onMouseUp.listen((e) {
      if (_dragging) {
        touchUp(e.client.x, e.client.y);
        _dragging = false;
      }
    }));
  }

  /// remove this touchable from the parent and cancel event subscriptions
  void remove() {
    target.remove();
    subscriptions.forEach((s) => s.cancel());
    subscriptions.clear();
  }

  /// move this touchable object to the given location
  void moveTo(num targetX, num targetY) {
    _x = targetX;
    _y = targetY;
    target.setAttribute("transform", "translate($x, $y)");
  }

  /// move the touchable object by the given delta
  void moveBy(num deltaX, num deltaY) {
    moveTo(x + deltaX, y + deltaY);
  }

  /// move this touchable to the top of the z-order
  void moveToTop() {
    target.remove();
    parent.append(target);
  }

  /// move this touchable to the bottom of the z-order
  void moveToBottom() {
    target.remove();
    parent.children.insert(0, target);
  }

  /// called when the object is clicked on
  bool touchDown(num touchX, num touchY);

  /// called when the object is released
  void touchUp(num touchX, num touchY);

  /// called when the object is dragged
  void touchDrag(num touchX, num touchY, num deltaX, num deltaY);
}



void main() {
  SvgElement tlayer = querySelector("#beat-machine");
  new DrumMachine(tlayer, 900, 300);
}
