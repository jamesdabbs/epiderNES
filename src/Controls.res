@react.component
let make = () =>
  <table className="column table is-bordered">
    <thead>
      <tr> <th> {React.string("Key")} </th> <th> {React.string("NES Input")} </th> </tr>
    </thead>
    <tbody>
      <tr> <td> {React.string("W")} </td> <td> {React.string("Up")} </td> </tr>
      <tr> <td> {React.string("S")} </td> <td> {React.string("Down")} </td> </tr>
      <tr> <td> {React.string("A")} </td> <td> {React.string("Left")} </td> </tr>
      <tr> <td> {React.string("D")} </td> <td> {React.string("Right")} </td> </tr>
      <tr> <td> {React.string("Backspace")} </td> <td> {React.string("Select")} </td> </tr>
      <tr> <td> {React.string("Return")} </td> <td> {React.string("Start")} </td> </tr>
      <tr> <td> {React.string("J")} </td> <td> {React.string("A")} </td> </tr>
      <tr> <td> {React.string("K")} </td> <td> {React.string("B")} </td> </tr>
    </tbody>
  </table>
