@react.component
let make = (~nes: Rawbones.Nes.t, ~running, ~dispatch) => {
  let reset = _ => dispatch(Action.Reset)
  let frame = _ => dispatch(Action.StepFrame)
  let step = _ => dispatch(Action.StepCpu)
  let stop = _ => dispatch(Action.Stop)
  let start = _ => dispatch(Action.Start)

  let toggle = switch running {
  | Some(_id) => <div className="navbar-item"> <a className="fas fa-stop" onClick=stop /> </div>
  | None => <div className="navbar-item"> <a className="fas fa-play" onClick=start /> </div>
  }

  <>
    <div className="navbar-item"> {ReasonReact.string(Util.displayHex(nes.cpu.pc))} </div>
    <div className="navbar-item"> <a className="fas fa-undo" onClick=reset /> </div>
    toggle
    <div className="navbar-item"> <a className="fas fa-step-forward" onClick=step /> </div>
    <div className="navbar-item"> <a className="fas fa-fast-forward" onClick=frame /> </div>
  </>
}
