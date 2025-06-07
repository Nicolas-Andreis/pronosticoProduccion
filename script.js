async function cargarDatosDesdeGoogleSheet() {
    const URL_CSV = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQUEFQ7R8Kel9_BMtpaQnQ_CTSkNu8Hlv_0D5jepEllAFBCqledXC02VVsRtDfbP3_DEvuLBWzvAvVs/pub?output=csv';
    const response = await fetch(URL_CSV);
    const csvText = await response.text();
    const lineas = csvText.trim().split('\n');
    const encabezados = lineas[0].split(',');

    const datos = lineas.slice(1).map(linea => {
        const valores = linea.split(',');
        return Object.fromEntries(encabezados.map((h, i) => [h.trim(), valores[i]?.trim() || '']));
    });

    const convertirFechaATimestamp = dateStr => {
        const ts = Math.floor(new Date(dateStr).getTime() / 1000);
        return isNaN(ts) ? null : ts;
    };

    let ventas = [], produccion = [], sugerida = [], fechasMap = {};

    datos.forEach(fila => {
        const ts = convertirFechaATimestamp(fila['Fecha']);
        if (!ts) return;
        const vendidas = parseInt(fila['Pizzas Vendidas'] || '0', 10);
        const producidas = parseInt(fila['Pizzas Producidas'] || '0', 10);
        const partidoTexto = fila['Partido']?.trim() || '';
        const feriadoTexto = fila['Feriado']?.trim() || '';

        ventas.push({ time: ts, value: vendidas });
        produccion.push({ time: ts, value: producidas });

        fechasMap[fila['Fecha']] = {
            timestamp: ts,
            vendidas,
            producidas,
            partidoTexto,
            feriadoTexto,
        };
    });

    const fechasOrdenadas = Object.keys(fechasMap).sort();
    for (let i = 0; i < fechasOrdenadas.length; i++) {
        const fecha = fechasOrdenadas[i];
        const info = fechasMap[fecha];
        let base = info.vendidas + 15;
        if (info.partidoTexto) base += 15;
        if (info.feriadoTexto) base += 15;
        sugerida.push({ time: info.timestamp, value: base });
    }

    // Cálculo de producción sugerida promedio últimos 4 días equivalentes
    const ultimaFecha = fechasOrdenadas.at(-1);
    const fechaDate = new Date(ultimaFecha);
    const diaSemana = fechaDate.getDay();

    let suma = 0;
    let cuenta = 0;

    for (let semanasAtras = 1; semanasAtras <= 4; semanasAtras++) {
        const fechaPasada = new Date(fechaDate);
        fechaPasada.setDate(fechaPasada.getDate() - 7 * semanasAtras);
        if (fechaPasada.getDay() === diaSemana) {
            const clave = fechaPasada.toISOString().split('T')[0];
            const venta = fechasMap[clave]?.vendidas;
            if (venta !== undefined) {
                suma += venta;
                cuenta++;
            }
        }
    }

    const promedio = cuenta > 0 ? suma / cuenta : 100;
    const prediccionSugerida = promedio + 15;
    const tsPrediccion = Math.floor(fechaDate.getTime() / 1000) + 86400;
    sugerida.push({ time: tsPrediccion, value: prediccionSugerida });

    const chart = LightweightCharts.createChart(document.getElementById('chart'), {
        width: 800,
        height: 400,
        layout: { background: { color: '#fff' }, textColor: '#000' },
        grid: { vertLines: { visible: true }, horzLines: { visible: true } },
        timeScale: { timeVisible: true, secondsVisible: false },
    });

    const seriesVentas = chart.addLineSeries({ color: 'red', title: 'Pizzas Vendidas' });
    const seriesProduccion = chart.addLineSeries({ color: 'green', title: 'Pizzas Producidas' });
    const seriesSugerida = chart.addLineSeries({ color: 'blue', title: 'Producción Sugerida', lineStyle: 1 });

    seriesVentas.setData(ventas);
    seriesProduccion.setData(produccion);
    seriesSugerida.setData(sugerida);

    // MARKERS VENTAS > PRODUCCIÓN
    const markersVentas = ventas
        .filter((p, i) => p.value > produccion[i]?.value)
        .map(p => ({
            time: p.time,
            position: 'aboveBar',
            color: 'red',
            shape: 'arrowDown',
            text: 'SIN PIZZAS',
        }));
    seriesVentas.setMarkers(markersVentas);

    // MARKERS PARTIDOS
    const markersPartido = fechasOrdenadas
        .map(fecha => {
            const info = fechasMap[fecha];
            if (info.partidoTexto) {
                return {
                    time: info.timestamp,
                    position: 'aboveBar',
                    color: 'blue',
                    shape: 'arrowDown',
                    text: info.partidoTexto,
                };
            }
            return null;
        })
        .filter(m => m !== null);

    // MARKERS FERIADOS
    const markersFeriado = fechasOrdenadas
        .map(fecha => {
            const info = fechasMap[fecha];
            if (info.feriadoTexto) {
                return {
                    time: info.timestamp,
                    position: 'aboveBar',
                    color: 'green',
                    shape: 'arrowDown',
                    text: 'Feriado',
                };
            }
            return null;
        })
        .filter(m => m !== null);

    seriesSugerida.setMarkers([...markersPartido, ...markersFeriado]);

    // ---- AÑADIDO para mostrar últimos 30 días al iniciar ----
    const SECONDS_IN_DAY = 24 * 3600;
    const ultimoTimestamp = ventas[ventas.length - 1].time;
    const desdeTimestamp = ultimoTimestamp - (30 * SECONDS_IN_DAY);

    chart.timeScale().setVisibleRange({ from: desdeTimestamp, to: ultimoTimestamp });
}

cargarDatosDesdeGoogleSheet();
