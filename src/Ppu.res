@react.component
let make = (~nes: Rawbones.Nes.t) => {
  let ppu = nes.ppu
  let {
    Rawbones.Ppu.control: control,
    mask,
    status,
    oam_address,
    oam_data,
    ppu_address,
    ppu_data,
    buffer,
    fine_x,
    write_latch,
  } = ppu.registers

  let raw = j`
registers
  control     $control
  mask        $mask
  status      $status
  oam_address $oam_address
  oam_data    $oam_data
  ppu_address $ppu_address
  ppu_data    $ppu_data
  buffer      $buffer
  fine_x      $fine_x
  write_latch $write_latch
`

  <pre> {ReasonReact.string(raw)} </pre>
}
