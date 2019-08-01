type state = {
  nes: option(Rawbones.Nes.t),
  refresh: option(int),
  last_frame_at: option(float),
};

let component = ReasonReact.reducerComponent("App");

let mutateRaw = (state, handler) => {
  switch (state.nes) {
  | Some(nes) => handler(nes)
  | _ => ()
  };
};

let mutate = (state, handler) =>
  ReasonReact.UpdateWithSideEffects(
    state,
    self => mutateRaw(self.state, handler),
  );

let stop = state => {
  switch (state.refresh) {
  | Some(id) =>
    Util.cancelAnimationFrame(id);
    {...state, refresh: None, last_frame_at: None};
  | None => state
  };
};

let rec nextFrame = self => {
  switch (self.ReasonReact.state.last_frame_at) {
  | Some(time) =>
    Js.log("Frame duration: " ++ Js.Float.toString(Util.now() -. time))
  | None => ()
  };
  self.ReasonReact.send(Action.StepFrame);
  let refreshId = Util.requestAnimationFrame(() => nextFrame(self));
  self.ReasonReact.send(Action.QueueFrame(refreshId));
};

let start = self => {
  let refreshId = Util.requestAnimationFrame(() => nextFrame(self));
  self.ReasonReact.send(Action.QueueFrame(refreshId));
};

let reset = state => {
  switch (state.nes) {
  | Some(nes) => {...state, nes: Some(Rawbones.Nes.load(nes.rom))}
  | None => {...state, nes: None}
  };
};

let handleInput = (keycode, pressed, nes: Rawbones.Nes.t) => {
  switch (keycode) {
  | 38 => nes.gamepad.up = pressed
  | 40 => nes.gamepad.down = pressed
  | 37 => nes.gamepad.left = pressed
  | 39 => nes.gamepad.right = pressed
  | 32 => nes.gamepad.select = pressed
  | 13 => nes.gamepad.start = pressed
  | 90 => nes.gamepad.a = pressed
  | 88 => nes.gamepad.b = pressed
  | _ => ()
  };
};

let make = _children => {
  ...component,

  initialState: () => {nes: None, refresh: None, last_frame_at: None},

  reducer: (action: Action.t, state: state) =>
    switch (action) {
    | Dirty => mutate(state, _ => ())
    | KeyDown(x) =>
      mutateRaw(state, handleInput(x, true));
      ReasonReact.NoUpdate;
    | KeyUp(x) =>
      mutateRaw(state, handleInput(x, false));
      ReasonReact.NoUpdate;
    | Load(nes) =>
      Util.setupDebugging(nes);
      ReasonReact.Update({...state, nes: Some(nes)});
    | Reset => ReasonReact.Update(reset(state))
    | StepCpu => mutate(state, nes => Rawbones.Nes.step(nes))
    | StepFrame =>
      mutate(state, nes => nes.frame = Rawbones.Nes.step_frame(nes))
    | Stop => ReasonReact.Update(stop(state))
    | QueueFrame(id) => ReasonReact.Update({...state, refresh: Some(id)})
    | Start => ReasonReact.SideEffects(self => start(self))
    },

  didMount: self => {
    Util.loadRom("nestest.nes", nes => self.send(Action.Load(nes)));
  },

  render: self => {
    let dispatch = action => self.send(action);

    let main =
      switch (self.state.nes) {
      | Some(nes) =>
        <>
          <section className="columns is-centered">
            <Display frame={nes.frame} dispatch />
          </section>
          <section className="section"> <Nes nes dispatch /> </section>
        </>
      | _ => <span />
      };

    let running = self.state.refresh;

    <>
      <Navbar
        nes={self.state.nes}
        onRomLoad={nes => dispatch(Action.Load(nes))}
        running
        dispatch
      />
      main
    </>;
  },
};

let default = ReasonReact.wrapReasonForJs(~component, _ => make([||]));