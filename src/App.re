type state = {
  nes: option(Rawbones.Nes.t),
  refresh: option(Js.Global.intervalId),
  continue: ref(bool),
};

let component = ReasonReact.reducerComponent("App");

let mutate = (state, handler) =>
  ReasonReact.UpdateWithSideEffects(
    state,
    self =>
      switch (self.state.nes) {
      | Some(nes) => handler(nes)
      | _ => ()
      },
  );

let stopRunning = state => {
  state.continue := false;

  switch (state.refresh) {
  | Some(intervalId) => Js.Global.clearInterval(intervalId)
  | _ => ()
  };

  {...state, refresh: None};
};

let make = _children => {
  ...component,

  initialState: () => {nes: None, refresh: None, continue: ref(false)},

  reducer: (action: Action.t, state: state) =>
    switch (action) {
    | Dirty => mutate(state, _ => ())
    | Load(nes) =>
      Util.setupDebugging(nes);
      ReasonReact.Update({...state, nes: Some(nes)});
    | Reset =>
      stopRunning(state)
      |> (
        s =>
          ReasonReact.Update({
            ...s,
            nes:
              switch (state.nes) {
              | Some(nes) => Some(Rawbones.Nes.load(nes.rom))
              | None => None
              },
          })
      )
    | Running(interval) =>
      ReasonReact.Update({...state, refresh: Some(interval)})
    | StepCpu =>
      mutate(state, nes => Rawbones.Nes.step(nes, ~on_frame=_ => ()))
    | StepFrame =>
      mutate(state, nes =>
        ignore(Rawbones.Nes.step_frame(nes, ~on_frame=_ => ()))
      )
    | Stop => ReasonReact.Update(stopRunning(state))
    | _ => ReasonReact.NoUpdate
    },

  didMount: self =>
    Util.loadRom("nestest.nes", nes => self.send(Action.Load(nes))),

  render: self => {
    let dispatch = action => self.send(action);

    let main =
      switch (self.state.nes) {
      | Some(nes) => <Nes nes dispatch />
      | _ => <span />
      };

    let running = self.state.continue^;

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