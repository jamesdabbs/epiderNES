type state = {
  nes: option<Rawbones.Nes.t>,
  refresh: option<int>,
  fps: option<int>,
  frame_count: int,
  last_fps_at: option<float>,
}

let component = ReasonReact.reducerComponent("App")

let mutateRaw = (state, handler) =>
  switch state.nes {
  | Some(nes) => handler(nes)
  | _ => ()
  }

let mutate = (state, handler) => ReasonReact.UpdateWithSideEffects(
  state,
  self => mutateRaw(self.state, handler),
)

let nextFps = state => {
  ...state,
  last_fps_at: Some(Util.now()),
  fps: Some(state.frame_count),
  frame_count: 0,
}

let countFrames = state => {
  let newState = {...state, frame_count: state.frame_count + 1}
  switch state.last_fps_at {
  | None => {...newState, last_fps_at: Some(Util.now())}
  | Some(time) =>
    let elapsed = int_of_float(Util.now() -. time)
    elapsed > 1000 ? nextFps(state) : newState
  }
}

let stop = state =>
  switch state.refresh {
  | Some(id) =>
    Util.cancelAnimationFrame(id)
    {...state, refresh: None, frame_count: 0, last_fps_at: None}
  | None => state
  }

let rec nextFrame = self => {
  self.ReasonReact.send(Action.StepFrame)
  let refreshId = Util.requestAnimationFrame(() => nextFrame(self))
  self.ReasonReact.send(Action.QueueFrame(refreshId))
}

let start = self => {
  let refreshId = Util.requestAnimationFrame(() => nextFrame(self))
  self.ReasonReact.send(Action.QueueFrame(refreshId))
}

let reset = state =>
  switch state.nes {
  | Some(nes) => {...state, nes: Some(Rawbones.Nes.load(nes.rom))}
  | None => {...state, nes: None}
  }

let handleInput = (keycode, pressed, nes: Rawbones.Nes.t) =>
  switch keycode {
  | 'W' => nes.gamepad.up = pressed
  | 'S' => nes.gamepad.down = pressed
  | 'A' => nes.gamepad.left = pressed
  | 'D' => nes.gamepad.right = pressed
  | '\b' => nes.gamepad.select = pressed
  | '\r' => nes.gamepad.start = pressed
  | 'J' => nes.gamepad.a = pressed
  | 'K' => nes.gamepad.b = pressed
  | _ => ()
  }

let make = _children => {
  ...component,
  initialState: () => {
    nes: None,
    refresh: None,
    fps: None,
    frame_count: 0,
    last_fps_at: None,
  },
  reducer: (action: Action.t, state: state) =>
    switch action {
    | Dirty => mutate(state, _ => ())
    | KeyDown(x) =>
      mutateRaw(state, handleInput(x, true))
      ReasonReact.NoUpdate
    | KeyUp(x) =>
      mutateRaw(state, handleInput(x, false))
      ReasonReact.NoUpdate
    | Load(nes) =>
      Util.setupDebugging(nes)
      ReasonReact.Update({...state, nes: Some(nes)})
    | Reset => ReasonReact.Update(reset(state))
    | StepCpu => mutate(state, nes => Rawbones.Nes.step(nes))
    | StepFrame =>
      let newState = countFrames(state)
      mutate(newState, nes => nes.frame = Rawbones.Nes.step_frame(nes))
    | Stop => ReasonReact.Update(stop(state))
    | QueueFrame(id) => ReasonReact.Update({...state, refresh: Some(id)})
    | Start => ReasonReact.SideEffects(self => start(self))
    },
  didMount: self => Util.loadRom("nestest.nes", nes => self.send(Action.Load(nes))),
  render: self => {
    let dispatch = action => self.send(action)
    let running = self.state.refresh

    <>
      <Navbar
        nes=self.state.nes
        onRomLoad={nes => dispatch(Action.Load(nes))}
        fps=self.state.fps
        running
        dispatch
      />
      <section className="section"> <Nes dispatch nes=self.state.nes /> </section>
    </>
  },
}

let default = ReasonReact.wrapReasonForJs(~component, _ => make([]))
