open Action

type keypress =
  | Down
  | Up

@react.component
let make = (~frame: Rawbones.Render.frame, ~dispatch) => {
  let canvasRef = React.useRef(Js.Nullable.null)

  let handleKey = (keypress, event) => {
    let character = Char.chr(ReactEvent.Keyboard.which(event))
    let action = switch keypress {
    | Down => KeyDown(character)
    | Up => KeyUp(character)
    }
    ReactEvent.Keyboard.preventDefault(event)
    dispatch(action)
  }

  React.useEffect(() => {
    Util.displayFrameScaled(canvasRef, frame)
    None
  })

  <div className="columns" tabIndex=0 onKeyDown={handleKey(Down)} onKeyUp={handleKey(Up)}>
    <canvas className="column" ref={ReactDOMRe.Ref.domRef(canvasRef)} width="512" height="480" />
    <Controls />
  </div>
}
