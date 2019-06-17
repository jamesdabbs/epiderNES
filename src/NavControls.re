[@react.component]
let make = (~nes: Rawbones.Nes.t, ~running, ~dispatch) => {
  let reset = _ => dispatch(Action.Reset);
  let step = _ => dispatch(Action.StepCpu);
  let stop = _ => dispatch(Action.Stop);
  let start = _ => dispatch(Action.StepFrame);

  let toggle =
    running
      ? <div className="navbar-item">
          <a className="fas fa-stop" onClick=stop />
        </div>
      : <div className="navbar-item">
          <a className="fas fa-fast-forward" onClick=start />
        </div>;

  <>
    <div className="navbar-item">
      {ReasonReact.string(Util.displayHex(nes.cpu.pc))}
    </div>
    <div className="navbar-item">
      <a className="fas fa-undo" onClick=reset />
    </div>
    <div className="navbar-item">
      <a className="fas fa-play" onClick=step />
    </div>
    toggle
  </>;
};