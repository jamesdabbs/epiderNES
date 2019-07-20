type state = {nes: option(Rawbones.Nes.t)};

[@react.component]
let make = () => {
  let (state, setState) = React.useState(() => {nes: None});

  let load = nes => setState(_ => {nes: Some(nes)});

  React.useEffect(() => {
    switch (state.nes) {
    | None => Util.loadRom("nestest.nes", load)
    | _ => ()
    };
    None;
  });

  let preview =
    switch (state.nes) {
    | Some(nes) => <Cpu cpu={nes.cpu} filename={nes.rom.pathname} />
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
              onLoad=load
            />
            <hr className="navbar-divider" />
            <a className="navbar-item"> <Upload onLoad=load /> </a>
          </div>
        </div>
      </div>
    </nav>
    <hr />
    preview
  </>;
};