-- Perfil do OSRM só para carris (comboio, metro, metro ligeiro, elétrico): usa as linhas de caminho de ferro do OpenStreetMap.
-- Serve para desenhar os percursos dos operadores sem desenho nos horários oficiais (CP, Metro de Lisboa e do Porto).
api_version = 4

function setup()
  return {
    properties = {
      max_speed_for_map_matching = 140 / 3.6,
      weight_name = 'duration',
      process_call_tagless_node = false,
      u_turn_penalty = 0,
      continue_straight_at_waypoint = false,
      use_turn_restrictions = false,
      left_hand_driving = false,
    },
    default_mode = mode.train,
    default_speed = 60,
  }
end

local CARRIS = {
  rail = 90,
  light_rail = 60,
  subway = 60,
  tram = 40,
  narrow_gauge = 50,
}

function process_node(profile, node, result)
end

function process_way(profile, way, result)
  local railway = way:get_value_by_key('railway')
  if not railway then return end
  local velocidade = CARRIS[railway]
  if not velocidade then return end

  -- Pátios, resguardos e linhas de serviço só em último caso
  local servico = way:get_value_by_key('service')
  if servico then velocidade = 8 end
  -- Linhas desativadas ou em construção não existem
  local estado = way:get_value_by_key('disused') or way:get_value_by_key('abandoned')
  if estado == 'yes' then return end

  result.forward_mode = mode.train
  result.backward_mode = mode.train
  result.forward_speed = velocidade
  result.backward_speed = velocidade
  result.name = way:get_value_by_key('name') or ''
end

function process_turn(profile, turn)
  turn.duration = 0
  turn.weight = 0
  if turn.is_u_turn then
    turn.duration = 600
    turn.weight = 600
  end
end

return {
  setup = setup,
  process_way = process_way,
  process_node = process_node,
  process_turn = process_turn,
}
