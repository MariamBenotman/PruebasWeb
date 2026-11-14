/**
 * Páginas "fijas" heredadas de la web antigua (proyectos, talleres, servicios, contacto…).
 * Miembros, Cybertech y Noticias NO están aquí: se generan solos a partir de src/content/.
 *
 * `cuerpo` admite Markdown.
 */
export interface Pagina {
	slug: string;
	titulo: string;
	seccion: string;
	intro: string;
	cuerpo?: string;
}

export const contacto = {
	email: 'aereset@gmail.com',
	direccion: 'Calle de José Gutiérrez Abascal, 2 · 28006 Madrid',
	escuela: 'ETSII · Universidad Politécnica de Madrid',
	redes: [
		{ nombre: 'Instagram', url: 'https://www.instagram.com/aereset/' },
		{ nombre: 'X / Twitter', url: 'https://twitter.com/reset_etsii' },
		{ nombre: 'Facebook', url: 'https://www.facebook.com/ResetETSII/' },
	],
};

export const paginas: Pagina[] = [
	{ slug: 'proyectos', titulo: 'Proyectos', seccion: 'Proyectos', intro: 'Proyectos de robótica, electrónica, automática e informática desarrollados por miembros de Reset.' },
	{ slug: 'proyectos/nuevos', titulo: 'Nuevos proyectos', seccion: 'Proyectos', intro: 'Proyectos en desarrollo de la asociación.' },
	{ slug: 'proyectos/nuevos/rr-8', titulo: 'RR-8', seccion: 'Nuevos proyectos', intro: 'Proyecto RR-8 de Reset.' },
	{ slug: 'proyectos/nuevos/reset-league', titulo: 'Reset League', seccion: 'Nuevos proyectos', intro: 'Proyecto Reset League.' },
	{ slug: 'proyectos/nuevos/rhex', titulo: 'Rhex', seccion: 'Nuevos proyectos', intro: 'Proyecto Rhex de Reset.' },
	{ slug: 'proyectos/antiguos', titulo: 'Antiguos proyectos', seccion: 'Proyectos', intro: 'Archivo de proyectos realizados por la asociación.' },
	{ slug: 'proyectos/antiguos/piano-gigante', titulo: 'Piano Gigante', seccion: 'Antiguos proyectos', intro: 'Piano interactivo de gran formato desarrollado por Reset para eventos de la ETSII.' },
	{ slug: 'proyectos/antiguos/hoverboard', titulo: 'Hoverboard', seccion: 'Antiguos proyectos', intro: 'Proyecto Hoverboard de Reset.' },
	{ slug: 'proyectos/antiguos/espasmitos', titulo: 'Espasmitos', seccion: 'Antiguos proyectos', intro: 'Proyecto Espasmitos de Reset.' },
	{ slug: 'proyectos/antiguos/apophis', titulo: 'Apophis', seccion: 'Antiguos proyectos', intro: 'Proyecto Apophis de Reset.' },
	{ slug: 'proyectos/antiguos/bci', titulo: 'BCI', seccion: 'Antiguos proyectos', intro: 'Proyecto BCI de Reset.' },
	{ slug: 'proyectos/antiguos/morphex', titulo: 'Morphex', seccion: 'Antiguos proyectos', intro: 'Proyecto Morphex de Reset.' },
	{ slug: 'talleres', titulo: 'Talleres', seccion: 'Talleres', intro: 'Talleres formativos y totalmente gratuitos organizados por Reset.' },
	{ slug: 'talleres/octubre-robotico', titulo: 'Octubre Robótico', seccion: 'Talleres', intro: 'Actividades y talleres de robótica organizados durante Octubre Robótico.' },
	{ slug: 'talleres/programacion-en-c', titulo: 'Programación en C', seccion: 'Talleres', intro: 'Taller de introducción a C: condicionales, bucles y funciones. Pensado para quien no tiene experiencia programando y quiere participar en Cybertech.' },
	{ slug: 'talleres/cybertech', titulo: 'Talleres de Cybertech', seccion: 'Talleres', intro: 'Talleres de preparación para la categoría Classic de Cybertech: Arduino, diseño de robots, soldadura y sensores.' },
	{ slug: 'servicios', titulo: 'Servicios', seccion: 'Servicios', intro: 'Servicios de Reset para el alumnado y el personal de la ETSII.' },
	{ slug: 'servicios/impresion-3d', titulo: 'Impresión 3D', seccion: 'Servicios', intro: 'Servicio de impresión 3D limitado al alumnado y personal de la ETSII (UPM).' },
	{ slug: 'servicios/taller', titulo: 'Taller', seccion: 'Servicios', intro: 'Espacio de trabajo de Reset y de los alumnos de Robótica.' },
	{ slug: 'servicios/prestamos', titulo: 'Préstamos', seccion: 'Servicios', intro: 'Préstamo de herramientas para la comunidad de la ETSII.' },
	{ slug: 'servicios/tutoriales', titulo: 'Tutoriales', seccion: 'Servicios', intro: 'Tutoriales y recursos formativos publicados por Reset.' },
	{ slug: 'calendario', titulo: 'Próximos eventos', seccion: 'Calendario', intro: 'Las fechas de talleres, Cybertech y demás actividades se anuncian en nuestras redes sociales.' },
	{ slug: 'colaboradores', titulo: 'Colaboradores', seccion: 'Conócenos', intro: 'Entidades que apoyan a Reset y a Cybertech.', cuerpo: `## JBC

JBC es una empresa global líder en soldadura electrónica, con más de 80 años de experiencia. Gracias a esta colaboración, los participantes de Cybertech pueden usar el lápiz de soldadura **30ST** durante la competición, y los miembros de Reset y todo el que use nuestro taller disponen de una estación de soldadura avanzada **CD-2BE**.` },
	{ slug: 'contacto', titulo: 'Contacto', seccion: 'Conócenos', intro: 'Si tienes alguna duda, sugerencia u oferta, escríbenos sin dudarlo.' },
	{ slug: 'participa', titulo: 'Participa en Reset', seccion: 'Conócenos', intro: '¿Quieres formar parte de algún proyecto, organizar las pruebas del próximo Cybertech o simplemente pasarlo bien y hacer amigos?', cuerpo: `Apúntate a la Asociación de Estudiantes Reset y conviértete en miembro activo de la comunidad: podrás representar a Reset en eventos dentro y fuera de la Escuela, dar tu opinión en las decisiones de la asociación o impartir talleres, entre otras cosas.

Ser miembro de Reset es **totalmente gratuito**: no pedimos donaciones ni cobramos nada. Somos una asociación sin ánimo de lucro, así que tampoco sacarás dinero, pero sí muchas horas de cacharreo.

Para unirte, escríbenos a **aereset@gmail.com** contándonos quién eres y qué te motiva, o pásate por el taller.` },
];

export const paginaPorSlug = (slug: string) => paginas.find((p) => p.slug === slug);
export const hijasDe = (slug: string) => {
	const depth = slug.split('/').length + 1;
	return paginas.filter((p) => p.slug.startsWith(`${slug}/`) && p.slug.split('/').length === depth);
};

/** Menú principal. Cybertech y Conócenos se completan solos con las ediciones y cursos que existan. */
export const menuFijo = [
	{ titulo: 'Proyectos', slug: 'proyectos', hijos: ['proyectos/nuevos', 'proyectos/antiguos'] },
	{ titulo: 'Talleres', slug: 'talleres', hijos: ['talleres/octubre-robotico', 'talleres/programacion-en-c', 'talleres/cybertech'] },
	{ titulo: 'Servicios', slug: 'servicios', hijos: ['servicios/impresion-3d', 'servicios/taller', 'servicios/prestamos', 'servicios/tutoriales'] },
];
