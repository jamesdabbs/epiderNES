[@react.component]
let make = (~nes: option(Rawbones.Nes.t), ~onRomLoad) => {
  let link = (label, path) =>
    <a className="navbar-item" onClick={_ => ReasonReactRouter.push(path)}>
      {ReasonReact.string(label)}
    </a>;

  let (title, controls) =
    switch (nes) {
    | Some(n) => (n.rom.pathname, <NavControls nes=n />)
    | _ => ("EpiderNES", <span />)
    };

  <nav className="navbar" role="navigation" ariaLabel="main navigation">
    <div className="navbar-brand">
      <a className="navbar-item" href="/">
        <p> {ReasonReact.string(title)} </p>
      </a>
    </div>
    <div className="navbar-menu">
      <div className="navbar-start">
        {link("CPU", "/cpu")}
        {link("PPU", "/ppu")}
        {link("ROM", "/rom")}
      </div>
      <div className="navbar-end">
        controls
        <div className="navbar-item has-dropdown is-hoverable">
          <a className="navbar-link"> {ReasonReact.string("ROMs")} </a>
          <div className="navbar-dropdown">
            <PublicRom
              className="navbar-item"
              name="NEStest"
              path="nestest.nes"
              onLoad=onRomLoad
            />
            <hr className="navbar-divider" />
            <a className="navbar-item"> <Upload onLoad=onRomLoad /> </a>
          </div>
        </div>
      </div>
    </div>
  </nav>;
};