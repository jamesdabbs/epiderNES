type state = {cpu: option(Rawbones.Cpu.t)};

[@react.component]
let make = () => {
  let (state, setState) = React.useState(() => {cpu: None});

  let loadCpu = cpu => setState(_ => {cpu: Some(cpu)});

  React.useEffect(() => {
    switch (state.cpu) {
    | None => Util.loadRom("nestest.nes", loadCpu)
    | _ => ()
    };
    None;
  });

  let preview =
    switch (state.cpu) {
    | Some(cpu) => <Cpu cpu />
    | _ => <span />
    };

  <>
    <nav className="navbar" role="navigation" ariaLabel="main navigation">
      <div className="navbar-brand">
        <a className="navbar-item" href="/">
          <p> {ReasonReact.string("EpiderNES")} </p>
        </a>
      </div>
      <div className="navbar-menu">
        <div className="navbar-item has-dropdown is-hoverable">
          <a className="navbar-link"> {ReasonReact.string("ROMs")} </a>
          <div className="navbar-dropdown">
            <PublicRom
              className="navbar-item"
              name="NEStest"
              path="nestest.nes"
              onLoad=loadCpu
            />
            <hr className="navbar-divider" />
            <a className="navbar-item"> <Upload onLoad=loadCpu /> </a>
          </div>
        </div>
      </div>
    </nav>
    <hr />
    preview
  </>;
};