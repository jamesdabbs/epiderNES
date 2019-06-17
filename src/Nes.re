[@react.component]
let make = (~nes: Rawbones.Nes.t, ~dispatch) => {
  let url = ReasonReactRouter.useUrl();

  let main =
    <div className="columns">
      <div className="column is-2"> <Cpu.Registers nes dispatch /> </div>
      <div className="column is-5"> <Cpu.Disassembly nes rows=20 /> </div>
      <div className="column is-5"> <Ppu nes /> </div>
    </div>;

  switch (url.path) {
  | [] => main
  | ["ppu"] => <Nametable nes />
  | _ => <p> {ReasonReact.string("Not found")} </p>
  };
};