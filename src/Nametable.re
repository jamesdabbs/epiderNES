module Cell = {
  type state = {
    value: int,
    editing: bool,
  };

  [@react.component]
  let make = (~nameTable, ~row: int, ~col: int) => {
    let offset = row * 32 + col;
    let value = nameTable[offset];

    let (state, setState) = React.useState(_ => {value, editing: false});

    let onMouseOver = _ => {
      Js.log("click");
      setState(s => {...s, editing: true});
    };

    let onBlur = _ => {
      nameTable[offset] = state.value;
      setState(s => {...s, editing: false});
    };

    let onChange = event => {
      let value = ReactEvent.Form.target(event)##value;
      setState(s => {...s, value});
    };

    let contents =
      if (state.editing) {
        <input
          className="input"
          width="1"
          type_="number"
          onBlur
          onChange
          value={string_of_int(state.value)}
        />;
      } else {
        <span onMouseOver>
          {ReasonReact.string(string_of_int(value))}
        </span>;
      };

    <td> contents </td>;
  };
};

module Row = {
  [@react.component]
  let make = (~nameTable, ~row: int) => {
    <tr>
      <th> {ReasonReact.string(string_of_int(row))} </th>
      {ReasonReact.array(
         Array.init(32, col =>
           <Cell nameTable row col key={string_of_int(col)} />
         ),
       )}
    </tr>;
  };
};

[@react.component]
let make = (~nes: Rawbones.Nes.t) => {
  let nameTable = nes.ppu.name_table;

  <div className="columns">
    <div className="column is-3"> <Patterns rom={nes.rom} /> </div>
    <div className="column is-5">
      <table>
        <tbody>
          {ReasonReact.array(
             Array.init(30, row =>
               <Row nameTable row key={string_of_int(row)} />
             ),
           )}
        </tbody>
      </table>
    </div>
    <div className="column is-4" />
  </div>;
};