export interface MunicipalityRef {
  name: string
  /** Barangay name and the maximum number of tanods the province allows for it. */
  barangays: [name: string, limit: number][]
}

// From "Number of Tanods per Barangay – Ajuy". Add the other Iloilo municipalities here as their lists arrive.
export const MUNICIPALITIES: MunicipalityRef[] = [
  {
    name: 'Ajuy',
    barangays: [
      ['Adcadarao', 13], ['Agbobolo', 9], ['Badiangan', 10], ['Barrido', 13], ['Bato Biasong', 11],
      ['Bay-ang', 18], ['Bucana Bunglas', 11], ['Central', 9], ['Culasi', 15], ['Lanjagan', 11],
      ['Luca', 15], ['Malayuan', 15], ['Mangorocoro', 12], ['Nasidman', 6], ['Pantalan Nabaye', 16],
      ['Pantalan Navarro', 8], ['Pedada', 10], ['Pili', 16], ['Pinantan Diel', 12], ['Pinantan Elizalde', 7],
      ['Pinay Espinosa', 11], ['Poblacion', 19], ['Progreso', 14], ['Puente Bunglas', 11], ['Punta Buri', 10],
      ['Rojas', 6], ['San Antonio', 15], ['Silagon', 7], ['Sto. Rosario', 12], ['Tagubanhan', 12],
      ['Taguhangin', 10], ['Tanduyan', 14], ['Tipacla', 13], ['Tubogan', 9],
    ],
  },
]

export const findMunicipality = (name: string) => MUNICIPALITIES.find((m) => m.name === name)

/** Provincial signatories carried over from the prototype. Confirm them on the Setup step each year. */
export const PROVINCIAL_SIGNATORIES = {
  auth: 'MARIA ALFREDA S. FAJARDO',
  authPos: 'Authorized Official',
  acct: 'ORWEN M. ANUEVO',
  treas: 'JEAN MAIRE G. UMADHAY',
  lce: 'GOV. ARTHUR R. DEFENSOR, JR.',
}

/** The ordinance floor for the per-tanod amount. */
export const MIN_AMOUNT = 1000
