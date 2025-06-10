async function cargarDatosDesdeGoogleSheet() {
    const URL_CSV =
        'https://docs.google.com/spreadsheets/d/e/2PACX-1vQUEFQ7R8Kel9_BMtpaQnQ_CTSkNu8Hlv_0D5jepEllAFBCqledXC02VVsRtDfbP3_DEvuLBWzvAvVs/pub?output=csv';

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

    let ventas = [], produccion = [], sugerida = [];
    let fechasMap = {};

    datos.forEach(fila => {
        const ts = convertirFechaATimestamp(fila['Fecha']);
        if (!ts) return;

        const vendidas = parseInt(fila['Pizzas Vendidas'] || '0', 10);
        const producidas = fila['Pizzas Producidas'] ? parseInt(fila['Pizzas Producidas'], 10) : 0;
        const partidoTexto = fila['Partido']?.trim() || '';
        const feriadoTexto = fila['Feriado']?.trim() || '';

        ventas.push({ time: ts, value: vendidas });
        produccion.push({ time: ts, value: producidas });

        fechasMap[fila['Fecha']] = { timestamp: ts, vendidas, producidas, partidoTexto, feriadoTexto };
    });

    const fechasOrdenadas = Object.keys(fechasMap).sort();

    // Calcular producción sugerida (solo para datos existentes)
    for (let fecha of fechasOrdenadas) {
        const info = fechasMap[fecha];
        let base = info.vendidas + 15;
        if (info.partidoTexto) base += 15;
        if (info.feriadoTexto) base += 15;
        sugerida.push({ time: info.timestamp, value: base });
    }

    // Predicción día siguiente (solo si hay suficientes datos)
    let prediccionSugerida = null;
    if (fechasOrdenadas.length >= 5) { // mínimo 5 días para predecir (podés ajustar)
        const ultimaFecha = fechasOrdenadas.at(-1);
        const fechaDate = new Date(ultimaFecha);
        const diaSemana = fechaDate.getDay();

        let suma = 0, cuenta = 0;
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

        if (cuenta > 0) {
            const promedio = suma / cuenta;
            prediccionSugerida = Math.round(promedio + 15);
            const tsPrediccion = Math.floor(fechaDate.getTime() / 1000) + 86400;
            sugerida.push({ time: tsPrediccion, value: prediccionSugerida });
        }
    }

    // Verificar datos de la última fecha para mostrar predicción o mensaje de alerta
    const ultimaFecha = fechasOrdenadas.at(-1);
    const fechaHoyDate = new Date();
    fechaHoyDate.setHours(0, 0, 0, 0);

    const fechaUltimaDate = new Date(ultimaFecha);
    fechaUltimaDate.setHours(0, 0, 0, 0);

    const diffMs = fechaHoyDate - fechaUltimaDate;
    const diffDias = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    const fechaHoyStr = fechaHoyDate.toISOString().split('T')[0];
    const infoUltimaFecha = fechasMap[ultimaFecha];

    const cardSugerida = document.querySelector('#card-sugerida'); // Suponiendo que tienes este elemento en el HTML

    if (!prediccionSugerida) {
        // No hay suficientes datos para la predicción
        cardSugerida.textContent = 'No hay suficientes datos para la predicción';
        cardSugerida.style.backgroundColor = '#fff3cd';
        cardSugerida.style.color = '#856404';
    } else if (
        ultimaFecha === fechaHoyStr &&
        infoUltimaFecha &&
        infoUltimaFecha.producidas !== null &&
        !isNaN(infoUltimaFecha.producidas) &&
        infoUltimaFecha.producidas !== ''
    ) {
        cardSugerida.textContent = `Producir ${prediccionSugerida} pizzas para mañana`;
        cardSugerida.style.backgroundColor = 'rgb(129 215 253 / 47%)';
        cardSugerida.style.color = 'rgb(76 127 150 / 95%)';
    } else {
        cardSugerida.textContent = `Hace ${diffDias} día${diffDias !== 1 ? 's' : ''} no registra producción`;
        cardSugerida.style.backgroundColor = '#f8d7da';
        cardSugerida.style.color = '#721c24';
    }

    // Totales últimos 7 y 30 días
    const ultimoTimestamp = ventas[ventas.length - 1].time;
    const desde7 = ultimoTimestamp - 7 * 86400;
    const desde30 = ultimoTimestamp - 30 * 86400;

    const ultimos7 = ventas.filter(v => v.time > desde7).reduce((acc, v) => acc + v.value, 0);
    const ultimos30 = ventas.filter(v => v.time > desde30).reduce((acc, v) => acc + v.value, 0);

    document.querySelector('#card-ultimos7 span').textContent = ultimos7;
    document.querySelector('#card-ultimos30 span').textContent = ultimos30;

    // Gráfico LightweightCharts
    const chart = LightweightCharts.createChart(document.getElementById('chart'), {
        width: 900,
        height: 320,
        layout: { background: { color: 'white' }, textColor: 'black' },
        grid: { vertLines: { visible: true }, horzLines: { visible: false } },
        timeScale: { timeVisible: true, secondsVisible: false },
    });

    const seriesVentas = chart.addLineSeries({ color: 'red', title: 'Pizzas Vendidas' });
    const seriesProduccion = chart.addLineSeries({ color: 'green', title: 'Pizzas Producidas' });
    const seriesSugerida = chart.addLineSeries({ color: 'blue', lineStyle: 1, title: 'Producción Sugerida' });

    seriesVentas.setData(ventas);
    seriesProduccion.setData(produccion);
    seriesSugerida.setData(sugerida);

    // Marcadores ventas > producción
    const markersVentas = ventas
        .filter((p, i) => p.value > (produccion[i]?.value ?? 0))
        .map(p => ({
            time: p.time,
            position: 'aboveBar',
            color: 'red',
            shape: 'arrowDown',
            text: 'SIN PIZZAS',
        }));
    seriesVentas.setMarkers(markersVentas);

    // Marcadores partidos (azul)
    const markersPartido = fechasOrdenadas
        .map(f => {
            const info = fechasMap[f];
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
        .filter(Boolean);

    // Marcadores feriados (verde)
    const markersFeriado = fechasOrdenadas
        .map(f => {
            const info = fechasMap[f];
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
        .filter(Boolean);

    seriesSugerida.setMarkers([...markersPartido, ...markersFeriado]);

    // Comparación ventas semana actual vs anterior
    const hoy = ventas.at(-1).time;
    const hace7d = hoy - 7 * 86400;
    const hace14d = hoy - 14 * 86400;

    const semanaActual = ventas.filter(v => v.time > hace7d && v.time <= hoy).reduce((acc, v) => acc + v.value, 0);
    const semanaAnterior = ventas.filter(v => v.time > hace14d && v.time <= hace7d).reduce((acc, v) => acc + v.value, 0);
    const diferencia = semanaActual - semanaAnterior;

    const cardResumen = document.querySelector('#card-ultimos7');
    cardResumen.innerHTML = `
        <span>${semanaActual} pizzas vendidas los últimos 7 días</span><br>
        <span>
            ${diferencia >= 0 ? '⬆️' : '⬇️'} ${Math.abs(diferencia)} respecto a los 7 días anteriores
        </span>
    `;
    if (diferencia >= 0) {
        cardResumen.style.backgroundColor = '#d4edda';
        cardResumen.style.color = '#155724';
    } else {
        cardResumen.style.backgroundColor = '#f8d7da';
        cardResumen.style.color = '#721c24';
    }

    // Configurar rango visible del gráfico
    const totalBarras = ventas.length + 10;
    const barrasVisibles = 25;
    chart.timeScale().setVisibleLogicalRange({
        from: totalBarras - barrasVisibles,
        to: totalBarras,
    });
}

cargarDatosDesdeGoogleSheet();
