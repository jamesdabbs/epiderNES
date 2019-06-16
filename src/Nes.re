[@react.component]
let make = (~nes: Rawbones.Nes.t) => {
  let url = ReasonReactRouter.useUrl();

  let cpu = <Cpu nes />;

  let rom = <Patterns rom={nes.rom} />;

  switch (url.path) {
  | [] => cpu
  | ["cpu"] => cpu
  | ["ppu"] => <Ppu nes />
  | ["rom"] => rom
  | _ => <p> {ReasonReact.string("Not found")} </p>
  };
};