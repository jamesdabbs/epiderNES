[@react.component]
let make = (~nes: Rawbones.Nes.t) => {
  <>
    <div className="navbar-item">
      {ReasonReact.string(Util.displayHex(nes.cpu.pc))}
    </div>
    <div className="navbar-item"> <div className="fas fa-stop" /> </div>
    <div className="navbar-item"> <div className="fas fa-play" /> </div>
    <div className="navbar-item">
      <div className="fas fa-fast-forward" />
    </div>
  </>;
};